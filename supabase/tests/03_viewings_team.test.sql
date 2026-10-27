-- Test voor bezichtigingen en teambeheer (etappe 1b-5).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run.
-- Het script eindigt ALTIJD met een melding in rood. Dat is bedoeld: de melding bevat het resultaat en
-- zorgt ervoor dat alle testgegevens automatisch worden teruggedraaid.
--   "TESTRESULTAAT: 30 geslaagd, 0 mislukt"  = alles in orde
--
-- Voer dit alleen uit op een project dat de migraties 20261027000100_core.sql, 20261027000200_leads.sql
-- en 20261027000300_viewings_team.sql heeft.

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  ug uuid := gen_random_uuid();  -- agent kantoor A
  um uuid := gen_random_uuid();  -- manager kantoor A
  uo uuid := gen_random_uuid();  -- tweede eigenaar kantoor A (later)
  org_a uuid; org_b uuid;
  person_a uuid; person_b uuid;
  lead_a uuid; lead_b uuid;
  prop_a uuid; prop_b uuid;
  view_a uuid;
  n int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',   'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',   'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid',  'authenticated', 'authenticated'),
    (ug, 'a-agent@test.invalid',   'authenticated', 'authenticated'),
    (um, 'a-manager@test.invalid', 'authenticated', 'authenticated'),
    (uo, 'a-owner2@test.invalid',  'authenticated', 'authenticated');

  -- Kantoor B: een eigen lead en pand
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');
  insert into public.people (org_id, full_name) values (org_b, 'Persoon B') returning id into person_b;
  insert into public.leads (org_id, person_id, purpose) values (org_b, person_b, 'sale') returning id into lead_b;
  insert into public.properties (org_id, title, purpose) values (org_b, 'Pand B', 'sale') returning id into prop_b;

  -- Kantoor A: eigenaar maakt kantoor en team
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid',  'viewer');
  perform public.add_member(org_a, 'a-agent@test.invalid',   'agent');
  perform public.add_member(org_a, 'a-manager@test.invalid', 'manager');
  insert into public.people (org_id, full_name) values (org_a, 'Persoon A') returning id into person_a;
  insert into public.leads (org_id, person_id, purpose) values (org_a, person_a, 'rent_long') returning id into lead_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand A', 'rent_long', 'available') returning id into prop_a;

  -- ===== Bezichtigingen =====

  -- V01 bezichtiging inplannen
  insert into public.viewings (org_id, lead_id, property_id, scheduled_at, notes)
  values (org_a, lead_a, prop_a, now() + interval '2 days', 'Sleutel bij de buurman')
  returning id into view_a;
  select count(*) into n from public.viewings where id = view_a and status = 'scheduled' and outcome is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V01 bezichtiging inplannen mislukt'; end if;

  -- V02 created_by is de ingelogde gebruiker
  select count(*) into n from public.viewings where id = view_a and created_by = ua;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V02 created_by klopt niet'; end if;

  -- V03 lead van een ander kantoor kan niet gekoppeld worden
  begin
    insert into public.viewings (org_id, lead_id, property_id, scheduled_at) values (org_a, lead_b, prop_a, now());
    bad := bad + 1; fails := fails || E'\n - V03 lead van ander kantoor gekoppeld';
  exception when others then ok := ok + 1;
  end;

  -- V04 pand van een ander kantoor kan niet gekoppeld worden
  begin
    insert into public.viewings (org_id, lead_id, property_id, scheduled_at) values (org_a, lead_a, prop_b, now());
    bad := bad + 1; fails := fails || E'\n - V04 pand van ander kantoor gekoppeld';
  exception when others then ok := ok + 1;
  end;

  -- V05 uitkomst zonder dat de bezichtiging gedaan is wordt geweigerd
  begin
    update public.viewings set outcome = 'interested' where id = view_a;
    bad := bad + 1; fails := fails || E'\n - V05 uitkomst bij geplande bezichtiging geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  -- V06 gedaan met uitkomst en datum is bijgewerkt
  update public.viewings set status = 'done', outcome = 'offer_made' where id = view_a;
  select count(*) into n from public.viewings where id = view_a and status = 'done' and outcome = 'offer_made' and updated_at >= created_at;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V06 afronden mislukt'; end if;

  -- V07 verplaatsen naar een andere datum
  update public.viewings set status = 'scheduled', outcome = null, scheduled_at = now() + interval '5 days' where id = view_a;
  select count(*) into n from public.viewings where id = view_a and status = 'scheduled' and scheduled_at > now() + interval '4 days';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V07 verplaatsen mislukt'; end if;

  -- V08 bezichtiging verwijderen kan niet
  begin
    delete from public.viewings where id = view_a;
    bad := bad + 1; fails := fails || E'\n - V08 bezichtiging kon verwijderd worden';
  exception when others then ok := ok + 1;
  end;

  -- V09 bezichtiging kan niet naar een ander kantoor verhuisd worden
  begin
    update public.viewings set org_id = org_b where id = view_a;
    bad := bad + 1; fails := fails || E'\n - V09 org_id kon gewijzigd worden';
  exception when others then ok := ok + 1;
  end;

  -- V10 lead of pand van een bezichtiging kan niet gewijzigd worden
  begin
    update public.viewings set lead_id = (select id from public.leads where org_id = org_a limit 1), property_id = gen_random_uuid() where id = view_a;
    bad := bad + 1; fails := fails || E'\n - V10 pand van bezichtiging kon gewijzigd worden';
  exception when others then ok := ok + 1;
  end;

  -- Agent kan plannen en afzeggen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- V11 agent kan een bezichtiging afzeggen
  update public.viewings set status = 'cancelled' where id = view_a;
  select count(*) into n from public.viewings where id = view_a and status = 'cancelled';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V11 agent kon niet afzeggen'; end if;

  -- Viewer van kantoor A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- V12 viewer ziet de bezichtiging
  select count(*) into n from public.viewings where id = view_a;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V12 viewer ziet bezichtiging niet'; end if;

  -- V13 viewer kan niet plannen
  begin
    insert into public.viewings (org_id, lead_id, property_id, scheduled_at) values (org_a, lead_a, prop_a, now());
    bad := bad + 1; fails := fails || E'\n - V13 viewer kon bezichtiging plannen';
  exception when others then ok := ok + 1;
  end;

  -- V14 viewer kan niet wijzigen
  update public.viewings set status = 'done' where id = view_a;
  select count(*) into n from public.viewings where id = view_a and status = 'done';
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V14 viewer kon bezichtiging wijzigen'; end if;

  -- Eigenaar van kantoor B
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- V15 ander kantoor ziet de bezichtiging niet
  select count(*) into n from public.viewings where id = view_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V15 bezichtiging zichtbaar voor ander kantoor'; end if;

  -- ===== Team =====

  -- T01 viewer ziet de ledenlijst met e-mailadressen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.list_members(org_a) where email in ('a-owner@test.invalid', 'a-viewer@test.invalid', 'a-agent@test.invalid', 'a-manager@test.invalid');
  if n = 4 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T01 ledenlijst klopt niet (' || n || ' van 4)'; end if;

  -- T02 iemand van een ander kantoor ziet de ledenlijst niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.list_members(org_a);
    bad := bad + 1; fails := fails || E'\n - T02 ledenlijst zichtbaar voor ander kantoor';
  exception when others then ok := ok + 1;
  end;

  -- T03 agent kan geen leden verwijderen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.remove_member(org_a, uv);
    bad := bad + 1; fails := fails || E'\n - T03 agent kon lid verwijderen';
  exception when others then ok := ok + 1;
  end;

  -- T04 manager kan een eigenaar niet verwijderen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', um, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.remove_member(org_a, ua);
    bad := bad + 1; fails := fails || E'\n - T04 manager kon eigenaar verwijderen';
  exception when others then ok := ok + 1;
  end;

  -- T05 manager kan de rol van een agent wijzigen en een viewer verwijderen
  perform public.add_member(org_a, 'a-agent@test.invalid', 'viewer');
  select count(*) into n from public.memberships where org_id = org_a and user_id = ug and role = 'viewer';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T05 rol wijzigen mislukt'; end if;
  perform public.add_member(org_a, 'a-agent@test.invalid', 'agent');

  -- T06 manager verwijdert de viewer; die ziet daarna niets meer van het kantoor
  perform public.remove_member(org_a, uv);
  select count(*) into n from public.memberships where org_id = org_a and user_id = uv;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T06 lid verwijderen mislukt'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.leads where id = lead_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T07 verwijderd lid ziet nog leads'; end if;
  select count(*) into n from public.viewings where id = view_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T08 verwijderd lid ziet nog bezichtigingen'; end if;

  -- T09 de laatste eigenaar kan niet verwijderd worden, ook niet door zichzelf
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.remove_member(org_a, ua);
    bad := bad + 1; fails := fails || E'\n - T09 laatste eigenaar kon verwijderd worden';
  exception when others then ok := ok + 1;
  end;

  -- T10 de laatste eigenaar kan zichzelf ook niet naar manager zetten
  begin
    perform public.add_member(org_a, 'a-owner@test.invalid', 'manager');
    bad := bad + 1; fails := fails || E'\n - T10 laatste eigenaar kon zichzelf degraderen';
  exception when others then ok := ok + 1;
  end;

  -- T11 verwijderen van iemand die geen lid is geeft een duidelijke fout
  begin
    perform public.remove_member(org_a, uv);
    bad := bad + 1; fails := fails || E'\n - T11 niet-lid kon verwijderd worden';
  exception when sqlstate 'P0002' then ok := ok + 1;
            when others then bad := bad + 1; fails := fails || E'\n - T11 verkeerde fout bij niet-lid';
  end;

  -- T12 met een tweede eigenaar mag de eerste wel vertrekken
  perform public.add_member(org_a, 'a-owner2@test.invalid', 'owner');
  perform public.remove_member(org_a, ua);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.memberships where org_id = org_a and role = 'owner' and user_id = uo;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T12 eigenaar vertrekken mislukt'; end if;

  -- T13 lid kan zichzelf verwijderen (agent verlaat het kantoor)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.remove_member(org_a, ug);
  select count(*) into n from public.memberships where org_id = org_a and user_id = ug;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T13 zelf vertrekken mislukt'; end if;

  -- Anonieme bezoeker
  reset role;
  set local role anon;

  -- T14 anoniem heeft geen toegang tot bezichtigingen of team
  begin
    perform count(*) from public.viewings;
    bad := bad + 1; fails := fails || E'\n - T14 anoniem kon bezichtigingen lezen';
  exception when others then ok := ok + 1;
  end;
  begin
    perform * from public.list_members(org_a);
    bad := bad + 1; fails := fails || E'\n - T15 anoniem kon ledenlijst lezen';
  exception when others then ok := ok + 1;
  end;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
