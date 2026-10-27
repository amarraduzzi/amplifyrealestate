-- Test voor etappe 1l: plan (proefperiode en betaald), alleen-lezen na de laatste dag en limieten.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027000900_subscription.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 33 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uag uuid := gen_random_uuid(); -- agent kantoor A
  uex uuid := gen_random_uuid(); -- derde persoon (extra lid)
  org_a uuid; org_b uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; per uuid;
  j jsonb; n int; s text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua,  'a-owner@test.invalid', 'authenticated', 'authenticated'),
    (ub,  'b-owner@test.invalid', 'authenticated', 'authenticated'),
    (uag, 'a-agent@test.invalid', 'authenticated', 'authenticated'),
    (uex, 'a-extra@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');

  -- L01 nieuw kantoor: proefperiode van 30 dagen, open
  j := public.org_plan(org_a);
  if j->>'plan' = 'trial' and (j->>'days_left')::int = 30 and (j->>'is_open')::boolean then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L01 nieuw kantoor: ' || j::text; end if;

  -- L02 gebruik wordt geteld (1 lid, 0 panden)
  if (j->>'members')::int = 1 and (j->>'properties')::int = 0 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L02 gebruik klopt niet: ' || j::text; end if;

  -- L03 tijdens de proef kun je gewoon werken
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 1', 'sale', 'available') returning id into p1;
  insert into public.people (org_id, full_name) values (org_a, 'Test Persoon') returning id into per;
  perform public.add_member(org_a, 'a-agent@test.invalid', 'agent');
  ok := ok + 1;

  -- L04 wie geen lid is, kan het plan niet opvragen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.org_plan(org_a);
    bad := bad + 1; fails := fails || E'\n - L04 buitenstaander zag het plan';
  exception when others then ok := ok + 1;
  end;

  -- L05 klanten kunnen hun eigen plan niet aanpassen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.organizations set plan_until = current_date + 3650 where id = org_a;
    bad := bad + 1; fails := fails || E'\n - L05 eigenaar kon plan_until aanpassen';
  exception when others then ok := ok + 1;
  end;
  begin
    update public.organizations set max_properties = 100000 where id = org_a;
    bad := bad + 1; fails := fails || E'\n - L06 eigenaar kon een limiet aanpassen';
  exception when others then ok := ok + 1;
  end;

  -- L07 klanten kunnen activate_plan niet aanroepen
  begin
    perform public.activate_plan('test-kantoor-a', current_date + 400);
    bad := bad + 1; fails := fails || E'\n - L07 eigenaar kon activate_plan aanroepen';
  exception when others then ok := ok + 1;
  end;

  -- Limiet panden = 2 (door jou, als beheerder)
  reset role;
  update public.organizations set max_properties = 2, max_members = 2 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 2', 'sale', 'available') returning id into p2;
  -- L08 het derde pand wordt geweigerd
  begin
    insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 3', 'sale', 'draft');
    bad := bad + 1; fails := fails || E'\n - L08 pand boven de limiet gelukt';
  exception when others then
    if sqlerrm like '%plan_limit_properties%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L08 verkeerde fout: ' || sqlerrm; end if;
  end;

  -- L09 een ingetrokken pand telt niet mee: intrekken maakt ruimte
  update public.properties set status = 'withdrawn' where id = p2;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 3', 'sale', 'available') returning id into p3;
  ok := ok + 1;

  -- L10 een ingetrokken pand weer actief maken boven de limiet wordt geweigerd
  begin
    update public.properties set status = 'available' where id = p2;
    bad := bad + 1; fails := fails || E'\n - L10 heractiveren boven de limiet gelukt';
  exception when others then
    if sqlerrm like '%plan_limit_properties%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L10 verkeerde fout: ' || sqlerrm; end if;
  end;

  -- L11 gewone wijzigingen aan een pand (prijs, titel) blijven werken op de limiet
  update public.properties set title = 'Pand 1 nieuw', price_cents = 100000 where id = p1;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L11 wijzigen op de limiet mislukte'; end if;

  -- L12 limiet leden: kantoor heeft 2 leden (eigenaar + agent), een derde wordt geweigerd
  begin
    perform public.add_member(org_a, 'a-extra@test.invalid', 'viewer');
    bad := bad + 1; fails := fails || E'\n - L12 lid boven de limiet gelukt';
  exception when others then
    if sqlerrm like '%plan_limit_members%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L12 verkeerde fout: ' || sqlerrm; end if;
  end;

  -- L13 de rol van een bestaand lid wijzigen op de limiet mag wel
  perform public.add_member(org_a, 'a-agent@test.invalid', 'manager');
  select count(*) into n from public.memberships where org_id = org_a and user_id = uag and role = 'manager';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L13 rol wijzigen op de limiet mislukte'; end if;

  -- Laatste dag: plan_until = vandaag blijft open
  reset role;
  update public.organizations set plan_until = current_date, max_properties = 100, max_members = 5 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.org_plan(org_a);
  if (j->>'days_left')::int = 0 and (j->>'is_open')::boolean then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L14 laatste dag klopt niet: ' || j::text; end if;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand laatste dag', 'sale', 'draft');
  ok := ok + 1;

  -- Verlopen: gisteren was de laatste dag
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- L16 plan toont verlopen
  j := public.org_plan(org_a);
  if not (j->>'is_open')::boolean and (j->>'days_left')::int = -1 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L16 verlopen plan klopt niet: ' || j::text; end if;

  -- L17 kijken kan nog
  select count(*) into n from public.properties where org_id = org_a;
  if n >= 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L17 eigenaar ziet panden niet meer (' || n || ')'; end if;
  select count(*) into n from public.people where org_id = org_a;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L18 eigenaar ziet personen niet meer'; end if;

  -- L19 nieuw pand, L20 pand wijzigen, L21 persoon toevoegen, L22 persoon verwijderen: alles geweigerd
  begin
    insert into public.properties (org_id, title, purpose, status) values (org_a, 'Te laat', 'sale', 'draft');
    bad := bad + 1; fails := fails || E'\n - L19 nieuw pand na afloop gelukt';
  exception when others then ok := ok + 1;
  end;
  update public.properties set title = 'Gewijzigd na afloop' where id = p1;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L20 pand wijzigen na afloop gelukt'; end if;
  begin
    insert into public.people (org_id, full_name) values (org_a, 'Te laat');
    bad := bad + 1; fails := fails || E'\n - L21 persoon toevoegen na afloop gelukt';
  exception when others then ok := ok + 1;
  end;
  delete from public.people where id = per;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L22 persoon verwijderen na afloop gelukt'; end if;

  -- L23 taken aanmaken en automatische taken: geweigerd
  begin
    insert into public.tasks (org_id, title) values (org_a, 'Te laat');
    bad := bad + 1; fails := fails || E'\n - L23 taak na afloop gelukt';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.sync_mandate_tasks(org_a);
    bad := bad + 1; fails := fails || E'\n - L24 sync na afloop gelukt';
  exception when others then ok := ok + 1;
  end;

  -- L25 lid toevoegen na afloop: geweigerd met plan_expired
  begin
    perform public.add_member(org_a, 'a-extra@test.invalid', 'viewer');
    bad := bad + 1; fails := fails || E'\n - L25 lid toevoegen na afloop gelukt';
  exception when others then
    if sqlerrm like '%plan_expired%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L25 verkeerde fout: ' || sqlerrm; end if;
  end;

  -- L26 een lid verwijderen mag nog (opruimen)
  perform public.remove_member(org_a, uag);
  ok := ok + 1;

  -- L27 kantoor B (eigen plan) is niet geraakt
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.properties (org_id, title, purpose, status) values (org_b, 'Pand B', 'sale', 'draft') returning id into p4;
  j := public.org_plan(org_b);
  if (j->>'is_open')::boolean and j->>'plan' = 'trial' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L27 kantoor B geraakt: ' || j::text; end if;

  -- L28 de publieke kantoorpagina blijft bereikbaar voor anonieme bezoekers
  reset role;
  set local role anon;
  begin
    perform public.public_office_page('test-kantoor-a');
    ok := ok + 1;
  exception when others then bad := bad + 1; fails := fails || E'\n - L28 publieke pagina niet bereikbaar: ' || sqlerrm;
  end;

  -- L29 activeren: plan active, nieuwe einddatum, limieten aangepast, daarna kun je weer werken
  reset role;
  s := public.activate_plan('  Test-Kantoor-A ', current_date + 365, 10, 250);
  select count(*) into n from public.organizations where id = org_a and plan = 'active' and plan_until = current_date + 365 and max_members = 10 and max_properties = 250;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L29 activeren klopt niet: ' || s; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Na activeren', 'sale', 'draft');
  j := public.org_plan(org_a);
  if (j->>'is_open')::boolean and j->>'plan' = 'active' and (j->>'days_left')::int = 365 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L30 plan na activeren: ' || j::text; end if;

  -- L31 activeren zonder limieten laat de bestaande limieten staan; onbekend kantoor en datum in het verleden worden geweigerd
  reset role;
  perform public.activate_plan('test-kantoor-a', current_date + 400);
  select count(*) into n from public.organizations where id = org_a and max_members = 10 and max_properties = 250 and plan_until = current_date + 400;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L31 verlengen zonder limieten klopt niet'; end if;
  begin
    perform public.activate_plan('bestaat-niet', current_date + 10);
    bad := bad + 1; fails := fails || E'\n - L32 onbekend kantoor werd geactiveerd';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.activate_plan('test-kantoor-a', current_date - 1);
    bad := bad + 1; fails := fails || E'\n - L33 datum in het verleden werd aanvaard';
  exception when others then ok := ok + 1;
  end;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
