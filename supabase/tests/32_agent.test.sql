-- Test voor Amplify Agent (uitvoering, gratis plan met 3 panden, bon de visite).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261101000100_agent.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  org_a uuid; org_b uuid; p1 uuid; pb uuid; r jsonb; d jsonb; msg text; sig text := 'data:image/png;base64,iVBORw0KGgo=';
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ag-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'ag-b@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Salma Bennani', 'salma-test');

  -- A01 kiezen voor Amplify Agent geeft het gratis plan: 3 panden, 1 persoon, altijd open
  r := public.set_edition(org_a, 'agent');
  d := public.org_plan(org_a);
  if r->>'plan' = 'free' and d->>'edition' = 'agent' and (d->>'max_properties')::int = 3 and (d->>'is_open')::boolean then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - A01 ' || d::text; end if;

  -- A02 een vierde pand wordt geweigerd
  insert into public.properties (org_id, title, purpose, status, price_cents) values (org_a, 'Appartement Agdal', 'sale', 'available', 150000000) returning id into p1;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Studio 2', 'rent_long', 'available'), (org_a, 'Studio 3', 'rent_long', 'available');
  begin insert into public.properties (org_id, title, purpose, status) values (org_a, 'Te veel', 'sale', 'available'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg like '%plan_limit_properties%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - A02 ' || coalesce(msg, 'geen fout'); end if;

  -- A03 een agent kan geen collega toevoegen
  begin perform public.add_member(org_a, 'ag-b@test.invalid', 'agent'); msg := null; exception when others then msg := sqlerrm; end;
  if msg like '%plan_limit_members%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - A03 ' || coalesce(msg, 'geen fout'); end if;

  -- A04 een bon de visite: zonder handtekening of met een kapot nummer gaat het niet, anders wel
  begin perform public.create_visit_voucher(p1, 'Karim', '06 12', sig); msg := null; exception when others then msg := sqlerrm; end;
  if msg like '%telefoon_ongeldig%' then
    begin perform public.create_visit_voucher(p1, 'Karim', '0612345678', 'geen'); msg := null; exception when others then msg := sqlerrm; end;
  end if;
  r := public.create_visit_voucher(p1, 'Karim El Idrissi', '06 12 34 56 78', sig, 12);
  if msg like '%handtekening_ontbreekt%' and r->>'token' ~ '^[0-9a-f]{36}$' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - A04 ' || coalesce(msg, 'geen fout'); end if;

  -- A05 een bon kan niet gewijzigd of verwijderd worden
  begin update public.visit_vouchers set visitor_name = 'Iemand anders' where org_id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then
    begin delete from public.visit_vouchers where org_id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  end if;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - A05 geen fout'; end if;
  reset role;

  -- A06 de bezoeker ziet zijn kopie met het nummer half verborgen; een verkeerde code geeft niets
  set local role anon;
  d := public.public_visit_voucher(r->>'token');
  if d->>'visitor_name' = 'Karim El Idrissi' and d->>'visitor_phone' = '06••••••78' and d->'property'->>'title' = 'Appartement Agdal'
     and public.public_visit_voucher(repeat('a', 36)) is null and public.public_visit_voucher('x') is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - A06 ' || coalesce(d::text, 'null'); end if;
  reset role;

  -- A07 een ander kantoor ziet de bon niet en kan er geen maken bij dit pand
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Ander Kantoor', 'ander-test');
  begin perform public.create_visit_voucher(p1, 'Stiekem', '0612345678', sig); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null and (select count(*) from public.visit_vouchers) = 0 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - A07 ' || coalesce(msg, 'geen fout'); end if;

  -- A08 terug naar agence geeft weer een proefperiode; een niet-eigenaar kan de uitvoering niet wijzigen
  begin perform public.set_edition(org_a, 'agence'); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.set_edition(org_a, 'agence');
  d := public.org_plan(org_a);
  if msg like '%niet_toegestaan%' and d->>'plan' = 'trial' and (d->>'max_properties')::int = 100 and (d->>'days_left')::int >= 7 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - A08 ' || coalesce(msg, 'geen fout') || ' ' || d::text; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
