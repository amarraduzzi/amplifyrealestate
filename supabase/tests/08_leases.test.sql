-- Test voor etappe 3a: huurovereenkomsten.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001200_leases.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 24 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  org_a uuid; org_b uuid;
  person_a uuid; person_a2 uuid; person_b uuid;
  prop_r uuid; prop_r2 uuid; prop_s uuid; prop_b uuid;
  l1 uuid; l2 uuid;
  n int; st text; d date;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',  'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',  'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');
  insert into public.people (org_id, full_name) values (org_b, 'Persoon B') returning id into person_b;
  insert into public.properties (org_id, title, purpose, status) values (org_b, 'Huur B', 'rent_long', 'available') returning id into prop_b;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Huurder A')  returning id into person_a;
  insert into public.people (org_id, full_name) values (org_a, 'Huurder A2') returning id into person_a2;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huur A',  'rent_long',  'available') returning id into prop_r;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huur A2', 'rent_short', 'reserved')  returning id into prop_r2;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Koop A',  'sale',       'available') returning id into prop_s;

  -- L01 overeenkomst aanmaken; created_by en standaarden
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, deposit_cents, start_date)
  values (org_a, prop_r, person_a, 650000, 1300000, current_date) returning id into l1;
  select count(*) into n from public.leases where id = l1 and status = 'active' and created_by = ua and payment_day = 1 and ended_on is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L01 aanmaken of standaarden kloppen niet'; end if;

  -- L02 pand wordt verhuurd
  select status::text into st from public.properties where id = prop_r;
  if st = 'rented' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L02 pand niet verhuurd: ' || st; end if;

  -- L03 een gereserveerd pand wordt ook verhuurd
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_r2, person_a2, 90000, current_date) returning id into l2;
  select status::text into st from public.properties where id = prop_r2;
  if st = 'rented' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L03 gereserveerd pand niet verhuurd: ' || st; end if;

  -- L04 koopwoning kan niet verhuurd worden
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_s, person_a, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L04 koopwoning verhuurd'; exception when others then ok := ok + 1; end;

  -- L05 maximaal een lopende overeenkomst per pand
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_r, person_a2, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L05 tweede lopende overeenkomst'; exception when others then ok := ok + 1; end;

  -- L06 huur moet groter dan 0 zijn, L07 betaaldag 1 t/m 28, L08 einddatum niet voor startdatum, L09 borg niet negatief
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_s, person_a, 0, current_date);
    bad := bad + 1; fails := fails || E'\n - L06 huur 0'; exception when others then ok := ok + 1; end;
  begin update public.leases set payment_day = 31 where id = l1;
    bad := bad + 1; fails := fails || E'\n - L07 betaaldag 31'; exception when others then ok := ok + 1; end;
  begin update public.leases set end_date = current_date - 5 where id = l1;
    bad := bad + 1; fails := fails || E'\n - L08 einddatum voor startdatum'; exception when others then ok := ok + 1; end;
  begin update public.leases set deposit_cents = -1 where id = l1;
    bad := bad + 1; fails := fails || E'\n - L09 negatieve borg'; exception when others then ok := ok + 1; end;

  -- L10 huurder of pand van een ander kantoor kan niet gekoppeld worden
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_b, person_a, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L10 pand van ander kantoor'; exception when others then ok := ok + 1; end;
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_r2, person_b, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L11 huurder van ander kantoor'; exception when others then ok := ok + 1; end;

  -- L12 pand en huurder staan vast
  begin update public.leases set tenant_person_id = person_a2 where id = l1;
    bad := bad + 1; fails := fails || E'\n - L12 huurder gewijzigd'; exception when others then ok := ok + 1; end;

  -- L13 huur en einddatum wijzigen mag
  update public.leases set rent_cents = 700000, end_date = current_date + 365 where id = l1;
  select count(*) into n from public.leases where id = l1 and rent_cents = 700000 and end_date = current_date + 365;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L13 wijzigen mislukt'; end if;

  -- L14 beeindigen: ended_on gevuld, pand weer beschikbaar
  update public.leases set status = 'ended' where id = l1;
  select ended_on into d from public.leases where id = l1;
  if d = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L14 ended_on niet gevuld'; end if;
  select status::text into st from public.properties where id = prop_r;
  if st = 'available' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L15 pand niet weer beschikbaar: ' || st; end if;

  -- L16 na beeindigen mag er een nieuwe overeenkomst komen voor hetzelfde pand
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_r, person_a2, 680000, current_date);
    ok := ok + 1;
  exception when others then bad := bad + 1; fails := fails || E'\n - L16 nieuwe overeenkomst na einde mislukt: ' || sqlerrm; end;

  -- L17 beeindigen zet een pand dat inmiddels op iets anders staat niet terug
  update public.properties set status = 'withdrawn' where id = prop_r2;
  update public.leases set status = 'ended' where id = l2;
  select status::text into st from public.properties where id = prop_r2;
  if st = 'withdrawn' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L17 ingetrokken pand veranderd: ' || st; end if;

  -- L18 viewer ziet maar wijzigt niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.leases;
  if n = 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L18 viewer ziet ' || n; end if;
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_s, person_a, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L19 viewer maakte overeenkomst'; exception when others then ok := ok + 1; end;
  update public.leases set rent_cents = 1 where id = l1;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L20 viewer wijzigde overeenkomst'; end if;

  -- L21 ander kantoor ziet niets
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.leases;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L21 ander kantoor ziet ' || n; end if;

  -- L22 anoniem heeft geen toegang
  reset role;
  set local role anon;
  begin perform count(*) from public.leases;
    bad := bad + 1; fails := fails || E'\n - L22 anoniem las overeenkomsten'; exception when others then ok := ok + 1; end;

  -- L23 plan afgelopen: niets meer aanmaken of wijzigen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, prop_r2, person_a2, 1000, current_date);
    bad := bad + 1; fails := fails || E'\n - L23 aangemaakt na afloop plan'; exception when others then ok := ok + 1; end;
  update public.leases set rent_cents = 1 where id = l1;
  select count(*) into n from public.leases where id = l1 and rent_cents = 700000;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L24 gewijzigd na afloop plan'; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
