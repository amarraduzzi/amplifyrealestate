-- Test voor etappe 3b: huurbetalingen.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001300_rent_payments.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 22 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  org_a uuid; org_b uuid;
  person_a uuid; person_b uuid;
  prop_a uuid; prop_a2 uuid; prop_b uuid;
  l1 uuid; l2 uuid; lb uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  n int; n2 int; st text; d date; amt bigint;
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
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_b, prop_b, person_b, 5000, current_date) returning id into lb;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Huurder A') returning id into person_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huur A',  'rent_long', 'available') returning id into prop_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huur A2', 'rent_long', 'available') returning id into prop_a2;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date, payment_day)
    values (org_a, prop_a, person_a, 650000, current_date, 15) returning id into l1;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date, end_date, payment_day)
    values (org_a, prop_a2, person_a, 90000, current_date, current_date + 5, 15) returning id into l2;

  -- R01 genereren: alleen vanaf vandaag, hooguit 31 dagen vooruit, het bedrag van de huur
  perform public.generate_rent_due(org_a);
  select count(*), min(due_date)::text, max(amount_cents) into n, st, amt from public.rent_payments where lease_id = l1;
  select max(due_date) into d from public.rent_payments where lease_id = l1;
  if n between 1 and 2 and st::date >= current_date and d <= current_date + 31 and amt = 650000 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - R01 genereren: ' || n || ' rijen, vanaf ' || coalesce(st, '-') || ', bedrag ' || coalesce(amt::text, '-'); end if;

  -- R02 nog eens genereren maakt niets dubbel
  select count(*) into n from public.rent_payments where org_id = org_a;
  select public.generate_rent_due(org_a) into n2;
  select count(*) into st from public.rent_payments where org_id = org_a;
  if n2 = 0 and st::int = n then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R02 tweede keer genereren maakte ' || n2 || ' rijen'; end if;

  -- R03 niets na de einddatum van de overeenkomst
  select count(*) into n from public.rent_payments where lease_id = l2 and due_date > current_date + 5;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R03 rijen na einddatum: ' || n; end if;

  -- Vaste testrijen (als beheerder, zodat de uitkomst niet van de datum van vandaag afhangt)
  reset role;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date - 40, 650000) returning id into p1;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date + 10, 650000) returning id into p2;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date + 40, 650000) returning id into p3;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date - 70, 650000) returning id into p4;

  -- R04 dezelfde maand twee keer kan niet
  begin insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date + 10, 1);
    bad := bad + 1; fails := fails || E'\n - R04 dubbele maand'; exception when others then ok := ok + 1; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- R05 betaald zetten vult de betaaldatum met vandaag
  update public.rent_payments set status = 'paid' where id = p1;
  select paid_on into d from public.rent_payments where id = p1;
  if d = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R05 paid_on niet vandaag'; end if;

  -- R06 een eigen betaaldatum mag
  update public.rent_payments set status = 'paid', paid_on = current_date - 3 where id = p4;
  select paid_on into d from public.rent_payments where id = p4;
  if d = current_date - 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R06 eigen betaaldatum niet bewaard'; end if;

  -- R07 ongedaan maken wist de betaaldatum
  update public.rent_payments set status = 'due' where id = p4;
  select count(*) into n from public.rent_payments where id = p4 and status = 'due' and paid_on is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R07 ongedaan maken'; end if;

  -- R08 een betaaldatum zonder status betaald wordt genegeerd
  update public.rent_payments set paid_on = current_date where id = p4;
  select count(*) into n from public.rent_payments where id = p4 and status = 'due' and paid_on is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R08 paid_on zonder status'; end if;

  -- R09 notitie en herinnering mogen
  update public.rent_payments set note = 'cash', reminded_on = current_date where id = p4;
  select count(*) into n from public.rent_payments where id = p4 and note = 'cash' and reminded_on = current_date;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R09 notitie of herinnering'; end if;

  -- R10 bedrag en vervaldatum kan een gebruiker niet wijzigen, aanmaken of verwijderen ook niet
  begin update public.rent_payments set amount_cents = 1 where id = p4;
    bad := bad + 1; fails := fails || E'\n - R10 bedrag gewijzigd'; exception when others then ok := ok + 1; end;
  begin update public.rent_payments set due_date = current_date where id = p4;
    bad := bad + 1; fails := fails || E'\n - R11 vervaldatum gewijzigd'; exception when others then ok := ok + 1; end;
  begin insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l1, current_date + 70, 1);
    bad := bad + 1; fails := fails || E'\n - R12 gebruiker maakte rij aan'; exception when others then ok := ok + 1; end;
  begin delete from public.rent_payments where id = p4;
    bad := bad + 1; fails := fails || E'\n - R13 gebruiker verwijderde rij'; exception when others then ok := ok + 1; end;

  -- R14 huur wijzigen: onbetaalde toekomstige maanden volgen, verlopen en betaalde niet
  update public.leases set rent_cents = 700000 where id = l1;
  select amount_cents into amt from public.rent_payments where id = p2;
  select count(*) into n from public.rent_payments where id in (p1, p4) and amount_cents = 650000;
  if amt = 700000 and n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R14 huurwijziging: toekomst ' || amt || ', oud ' || n; end if;

  -- R15 beeindigen: onbetaalde maanden na de einddatum vervallen, verlopen en betaalde blijven
  update public.leases set status = 'ended' where id = l1;
  select status::text into st from public.rent_payments where id = p2;
  select count(*) into n from public.rent_payments where id in (p4) and status = 'due';
  select count(*) into n2 from public.rent_payments where id = p1 and status = 'paid';
  if st = 'cancelled' and n = 1 and n2 = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R15 beeindigen: toekomst ' || st || ', verlopen ' || n || ', betaald ' || n2; end if;

  -- R16 heropenen: vervallen maanden zijn weer te betalen
  update public.leases set status = 'active' where id = l1;
  select status::text into st from public.rent_payments where id = p2;
  if st = 'due' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R16 heropenen: ' || st; end if;

  -- R17 viewer ziet de betalingen, wijzigt niets en maakt niets aan
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.rent_payments;
  if n >= 4 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R17 viewer ziet ' || n; end if;
  update public.rent_payments set status = 'paid' where id = p2;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R18 viewer wijzigde betaling'; end if;
  select public.generate_rent_due(org_a) into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R19 viewer genereerde rijen'; end if;

  -- R20 ander kantoor ziet niets van kantoor A en kan er niets voor aanmaken
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.rent_payments where org_id = org_a;
  select public.generate_rent_due(org_a) into n2;
  if n = 0 and n2 = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R20 ander kantoor ziet ' || n || ' of maakte ' || n2; end if;

  -- R21 anoniem heeft geen toegang
  reset role;
  set local role anon;
  begin perform count(*) from public.rent_payments;
    bad := bad + 1; fails := fails || E'\n - R21 anoniem las betalingen'; exception when others then ok := ok + 1; end;

  -- R22 plan afgelopen: niets meer wijzigen of genereren
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rent_payments set status = 'paid' where id = p2;
  select count(*) into n from public.rent_payments where id = p2 and status = 'due';
  select public.generate_rent_due(org_a) into n2;
  if n = 1 and n2 = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R22 na afloop plan: wijzigen ' || (1 - n) || ', genereren ' || n2; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
