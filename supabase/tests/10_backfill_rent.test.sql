-- Test voor etappe 4c: eerdere huurmaanden achteraf invullen.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001600_backfill_rent.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  org_a uuid; person_a uuid; prop_a uuid; prop_b uuid; l1 uuid; l2 uuid;
  n int; n2 int; d date; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'bf-a@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'bf-v@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Backfill Kantoor', 'backfill-kantoor', 'Rabat');
  perform public.add_member(org_a, 'bf-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Huurder') returning id into person_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huis 1', 'rent_long', 'available') returning id into prop_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huis 2', 'rent_long', 'available') returning id into prop_b;
  -- loopt al twee jaar, betaaldag 5
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date, payment_day)
    values (org_a, prop_a, person_a, 400000, current_date - 730, 5) returning id into l1;
  -- loopt al acht jaar, betaaldag 10
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date, payment_day)
    values (org_a, prop_b, person_a, 300000, current_date - 2920, 10) returning id into l2;
  perform public.generate_rent_due(org_a);

  -- B01 zes maanden terug als betaald: elke maand een regel op de 5e, betaald op de vervaldatum, niets in de toekomst
  select public.backfill_rent(l1, (current_date - interval '6 months')::date, true) into n;
  select count(*) into n2 from public.rent_payments
   where lease_id = l1 and status = 'paid' and paid_on = due_date and extract(day from due_date) = 5 and due_date <= current_date;
  if n between 5 and 7 and n2 = n then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B01 toegevoegd ' || n || ', correct ' || n2; end if;

  -- B02 nog eens: niets dubbel
  select public.backfill_rent(l1, (current_date - interval '6 months')::date, true) into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B02 tweede keer ' || n || ' toegevoegd'; end if;

  -- B03 verder terug als onbetaald: alleen de nieuwe maanden, bestaande blijven betaald
  select count(*) into n2 from public.rent_payments where lease_id = l1 and status = 'paid';
  select public.backfill_rent(l1, (current_date - interval '12 months')::date, false) into n;
  select count(*) into msg from public.rent_payments where lease_id = l1 and status = 'paid';
  if n between 5 and 7 and msg::int = n2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B03 toegevoegd ' || n || ', betaald voor/na ' || n2 || '/' || msg; end if;

  -- B04 nooit voor het begin van de overeenkomst
  select public.backfill_rent(l1, current_date - 3000, true) into n;
  select min(due_date) into d from public.rent_payments where lease_id = l1;
  if d >= current_date - 730 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B04 eerste maand ' || d; end if;

  -- B05 maximaal 60 per keer, en nog eens klikken vult verder aan
  select public.backfill_rent(l2, current_date - 2920, true) into n;
  select public.backfill_rent(l2, current_date - 2920, true) into n2;
  if n = 60 and n2 > 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B05 eerste keer ' || n || ', tweede keer ' || n2; end if;

  -- B06 een viewer mag het niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.backfill_rent(l1, current_date - 700, true); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B06 viewer kon invullen'; end if;

  -- B07 een beeindigde overeenkomst krijgt niets na de einddag
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.leases set status = 'ended', ended_on = current_date - 100 where id = l1;
  reset role;
  delete from public.rent_payments where lease_id = l1;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.backfill_rent(l1, current_date - 400, false);
  select max(due_date) into d from public.rent_payments where lease_id = l1;
  if d <= current_date - 100 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B07 laatste maand ' || coalesce(d::text, '-'); end if;

  -- B08 plan afgelopen: niets meer invullen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.backfill_rent(l2, current_date - 2920, true); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'plan_expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B08 na afloop plan: ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
