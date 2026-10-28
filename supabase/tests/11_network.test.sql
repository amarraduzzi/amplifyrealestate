-- Test voor etappe 5a: Amplify Network.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001700_network.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 16 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uc uuid := gen_random_uuid();  -- eigenaar kantoor C (geen partner)
  ug uuid := gen_random_uuid();  -- agent kantoor A
  org_a uuid; org_b uuid; org_c uuid;
  prop_a uuid; prop_a2 uuid;
  pid uuid;
  j jsonb; n int; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'net-a@test.invalid', 'authenticated', 'authenticated'),
    (ub, 'net-b@test.invalid', 'authenticated', 'authenticated'),
    (uc, 'net-c@test.invalid', 'authenticated', 'authenticated'),
    (ug, 'net-g@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Net Kantoor B', 'net-kantoor-b', 'Casablanca');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_c := public.create_organization('Net Kantoor C', 'net-kantoor-c', 'Tanger');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Net Kantoor A', 'net-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'net-g@test.invalid', 'agent');
  insert into public.properties (org_id, title, purpose, status, address_note, price_cents)
    values (org_a, 'Appartement Agdal', 'sale', 'available', 'Geheim adres 12', 150000000) returning id into prop_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Concept', 'sale', 'draft') returning id into prop_a2;

  -- N01 onbekende code
  begin perform public.request_partnership(org_a, 'bestaat-niet'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'No office found with that code.' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N01 onbekende code: ' || coalesce(msg, 'geen fout'); end if;

  -- N02 eigen kantoor
  begin perform public.request_partnership(org_a, 'net-kantoor-a'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'That is your own office.' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N02 eigen kantoor: ' || coalesce(msg, 'geen fout'); end if;

  -- N03 uitnodigen (hoofdletters en spaties maken niet uit)
  pid := public.request_partnership(org_a, '  Net-Kantoor-B ');
  if pid is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N03 uitnodigen mislukt'; end if;

  -- N04 dubbele uitnodiging geweigerd
  begin perform public.request_partnership(org_a, 'net-kantoor-b'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg like 'There is already a partnership%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N04 dubbel: ' || coalesce(msg, 'geen fout'); end if;

  -- N05 agent mag niet uitnodigen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.request_partnership(org_a, 'net-kantoor-c'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N05 agent kon uitnodigen'; end if;

  -- N06 delen kan pas na accepteren
  begin perform public.share_property(prop_a, org_b, 2, 'Halve commissie'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'This office is not your partner.' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N06 delen voor accepteren: ' || coalesce(msg, 'geen fout'); end if;

  -- N07 het uitnodigende kantoor kan zijn eigen uitnodiging niet accepteren
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.respond_partnership(pid, true); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N07 zelf geaccepteerd'; end if;

  -- N08 B ziet de uitnodiging als inkomend en accepteert
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_overview(org_b);
  if (j->'partners'->0->>'incoming')::boolean and j->'partners'->0->>'name' = 'Net Kantoor A' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - N08 overzicht B: ' || j::text; end if;
  perform public.respond_partnership(pid, true);

  -- N09 agent van A deelt een beschikbaar pand
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.share_property(prop_a, org_b, 2, 'Halve commissie');
  perform public.share_property(prop_a, org_b, 2.5, 'Aangepast');
  select count(*) into n from public.property_shares where property_id = prop_a and commission_pct = 2.5;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N09 delen en wijzigen: ' || n || ' rijen'; end if;

  -- N10 een concept kan niet gedeeld worden
  begin perform public.share_property(prop_a2, org_b, null, null); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'Only available properties can be shared.' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N10 concept delen: ' || coalesce(msg, 'geen fout'); end if;

  -- N11 B ziet het pand, met percentage, maar zonder adres
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_overview(org_b);
  if jsonb_array_length(j->'properties') = 1 and j->'properties'->0->>'title' = 'Appartement Agdal'
     and (j->'properties'->0->>'commission_pct')::numeric = 2.5 and position('Geheim' in j::text) = 0 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - N11 overzicht B: ' || j::text; end if;

  -- N12 B kan de tabellen van A niet lezen
  select count(*) into n from public.properties where org_id = org_a;
  select n + count(*) into n from public.property_shares where org_id = org_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N12 B leest ' || n || ' rijen van A'; end if;

  -- N13 C (geen partner) ziet niets en kan het overzicht van B niet opvragen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_overview(org_c);
  begin perform public.network_overview(org_b); msg := null;
  exception when others then msg := sqlerrm; end;
  if jsonb_array_length(j->'properties') = 0 and jsonb_array_length(j->'partners') = 0 and msg is not null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - N13 kantoor C ziet ' || j::text; end if;

  -- N14 pand niet meer beschikbaar: partner ziet het niet meer
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.properties set status = 'reserved' where id = prop_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_overview(org_b);
  if jsonb_array_length(j->'properties') = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N14 gereserveerd pand nog zichtbaar'; end if;

  -- N15 B beeindigt: partnerschap en gedeelde panden zijn weg
  perform public.end_partnership(pid);
  reset role;
  select count(*) into n from public.partnerships where id = pid;
  select n + count(*) into n from public.property_shares where property_id = prop_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N15 na beeindigen nog ' || n || ' rijen'; end if;

  -- N16 plan afgelopen: niet meer uitnodigen
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.request_partnership(org_a, 'net-kantoor-c'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'plan_expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - N16 na afloop plan: ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
