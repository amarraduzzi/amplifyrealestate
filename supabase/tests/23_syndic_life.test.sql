-- Test voor etappe 9c/9d/9e: storingen, mededelingen, AG en bewonersportaal.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028001200_syndic_life.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  org_a uuid; org_b uuid; res uuid; l1 uuid; l2 uuid; l3 uuid; p1 uuid; ag uuid; r1 uuid; inc uuid; tok text; j jsonb; msg text; n int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'sl-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'sl-b@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Leven B', 'leven-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Leven A', 'leven-kantoor-a');
  insert into public.people (org_id, full_name) values (org_a, 'Mme Bennani') returning id into p1;
  insert into public.residences (org_id, name) values (org_a, 'Résidence Les Jardins') returning id into res;
  insert into public.residence_lots (org_id, residence_id, label, tantiemes, owner_person_id) values (org_a, res, 'A1', 500, p1) returning id into l1;
  insert into public.residence_lots (org_id, residence_id, label, tantiemes) values (org_a, res, 'A2', 300) returning id into l2;
  insert into public.residence_lots (org_id, residence_id, label, tantiemes) values (org_a, res, 'A3', 200) returning id into l3;
  perform public.issue_charge_call(res, 'Charges T1', current_date + 10, 100000);

  -- L01 storing: afgerond zet de datum
  insert into public.residence_incidents (org_id, residence_id, title, location, urgent) values (org_a, res, 'Ascenseur en panne', 'Ascenseur', true) returning id into inc;
  update public.residence_incidents set status = 'done' where id = inc;
  if (select done_on from public.residence_incidents where id = inc) = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L01'; end if;

  -- L02 AG met resolutie, aanwezigheid en stemmen
  insert into public.assemblies (org_id, residence_id, held_at, place) values (org_a, res, now() + interval '7 days', 'Hall') returning id into ag;
  insert into public.assembly_resolutions (org_id, assembly_id, position, text) values (org_a, ag, 1, 'Approbation des comptes') returning id into r1;
  insert into public.assembly_presence (org_id, assembly_id, lot_id, presence) values (org_a, ag, l1, 'present'), (org_a, ag, l2, 'represented'), (org_a, ag, l3, 'absent');
  insert into public.assembly_votes (org_id, resolution_id, lot_id, vote) values (org_a, r1, l1, 'for'), (org_a, r1, l2, 'against');
  select count(*) into n from public.assembly_votes where resolution_id = r1;
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L02 ' || n; end if;

  -- L03 een kavel stemt maar een keer per resolutie
  begin insert into public.assembly_votes (org_id, resolution_id, lot_id, vote) values (org_a, r1, l1, 'against'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L03 dubbel gestemd'; end if;

  -- L04 na afsluiten liggen stemmen en agenda vast
  update public.assemblies set status = 'held' where id = ag;
  n := 0;
  begin update public.assembly_votes set vote = 'abstain' where resolution_id = r1 and lot_id = l2; exception when others then n := n + 1; end;
  begin insert into public.assembly_resolutions (org_id, assembly_id, position, text) values (org_a, ag, 2, 'Nouveau'); exception when others then n := n + 1; end;
  begin update public.assemblies set place = 'Ailleurs' where id = ag; exception when others then n := n + 1; end;
  if n = 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L04 ' || n || ' van 3 geweigerd'; end if;

  -- L05 mededeling plaatsen
  insert into public.residence_announcements (org_id, residence_id, title, body) values (org_a, res, 'Coupure d''eau', 'Mardi de 9h à 12h');
  select count(*) into n from public.residence_announcements where residence_id = res;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L05'; end if;

  -- L06 bewonersportaal: eigen kavel, eigen charges, uitslag AG in tantièmes
  tok := public.create_resident_link(l1, 'fr');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  j := public.public_resident_portal(tok);
  reset role;
  if j->'lot'->>'label' = 'A1' and jsonb_array_length(j->'charges') = 1 and (j->'charges'->0->>'amount_cents')::bigint = 50000
     and (j->'assemblies'->0->'resolutions'->0->>'for')::numeric = 500 and (j->'assemblies'->0->'resolutions'->0->>'against')::numeric = 300
     and jsonb_array_length(j->'announcements') = 1 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L06 ' || coalesce(left(j::text, 300), 'null'); end if;

  -- L07 portaal toont geen gegevens van andere kavels
  if position('A2' in (j->'charges')::text) = 0 and j->'lot'->>'owner' = 'Mme Bennani' and public.public_resident_portal(repeat('b', 64)) is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L07'; end if;

  -- L08 een ander kantoor ziet niets en kan geen bewonerslink maken
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.assemblies where org_id = org_a;
  select n + count(*) into n from public.residence_incidents where org_id = org_a;
  begin perform public.create_resident_link(l1); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L08 ziet ' || n; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
