-- Test voor etappe 7b: beheercontract en maandafrekening.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000700_management.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 9 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; ow uuid; other uuid; tenant uuid; pr uuid; ls uuid; c uuid; st uuid; pay uuid; tok text;
  r record; msg text; n int; j jsonb;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'mg-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'mg-g@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'mg-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Beheer Kantoor', 'beheer-kantoor');
  perform public.add_member(org_a, 'mg-g@test.invalid', 'agent');
  perform public.add_member(org_a, 'mg-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Samira Ouazzani') returning id into ow;
  insert into public.people (org_id, full_name) values (org_a, 'Iemand Anders') returning id into other;
  insert into public.people (org_id, full_name) values (org_a, 'Huurder') returning id into tenant;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Appartement Océan', 'rent_long', 'available') returning id into pr;
  insert into public.property_parties (org_id, property_id, person_id, role) values (org_a, pr, ow, 'owner');
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, pr, tenant, 1000000, current_date - 60) returning id into ls;
  reset role;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents, status, paid_on)
    values (org_a, ls, date_trunc('month', current_date)::date, 1000000, 'paid', date_trunc('month', current_date)::date) returning id into pay;
  insert into public.maintenance_requests (org_id, property_id, title, status, done_on, cost_cents, cost_borne_by)
    values (org_a, pr, 'Robinet', 'done', date_trunc('month', current_date)::date, 30000, 'owner'),
           (org_a, pr, 'Ampoule', 'done', date_trunc('month', current_date)::date, 5000, 'tenant');
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- B01 contract alleen met de eigenaar van het pand
  begin insert into public.management_contracts (org_id, property_id, owner_person_id, fee_pct) values (org_a, pr, other, 8); msg := null; exception when others then msg := sqlerrm; end;
  if msg like '%contract_owner_not_owner%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B01 ' || coalesce(msg, 'geen fout'); end if;

  -- B02 agent maakt een contract van 8%; een tweede lopend contract kan niet
  insert into public.management_contracts (org_id, property_id, owner_person_id, fee_pct, owner_rib) values (org_a, pr, ow, 8, '011 780 0000123456789 01') returning id into c;
  begin insert into public.management_contracts (org_id, property_id, owner_person_id, fee_pct) values (org_a, pr, ow, 5); msg := null; exception when others then msg := sqlerrm; end;
  if c is not null and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B02 tweede contract toegestaan'; end if;

  -- B03 afrekening: 10.000 huur, 8% fee = 800, reparatie eigenaar 300 (niet die van de huurder), uit te betalen 8.900
  st := public.make_statement(c, current_date);
  select * into r from public.owner_statements where id = st;
  if r.rent_cents = 1000000 and r.fee_cents = 80000 and r.repairs_cents = 30000 and r.payout_cents = 890000 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - B03 ' || r.rent_cents || '/' || r.fee_cents || '/' || r.repairs_cents || '/' || r.payout_cents; end if;

  -- B04 opnieuw maken rekent opnieuw uit (zelfde regel, geen dubbel)
  reset role;
  update public.maintenance_requests set cost_cents = 50000 where title = 'Robinet';
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.make_statement(c, current_date);
  select count(*), max(payout_cents) into n, msg from public.owner_statements where contract_id = c;
  if n = 1 and msg::bigint = 870000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B04 ' || n || ' regels, ' || msg; end if;

  -- B05 geen afrekening voor een toekomstige maand
  begin perform public.make_statement(c, current_date + 40); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'statement_future_month' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B05 ' || coalesce(msg, 'geen fout'); end if;

  -- B06 een agent kan niet uitbetaald zetten; de eigenaar wel, en dan ligt alles vast
  update public.owner_statements set status = 'paid_out' where id = st;
  select status::text into msg from public.owner_statements where id = st;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.owner_statements set status = 'paid_out' where id = st;
  select count(*) into n from public.owner_statements where id = st and status = 'paid_out' and paid_out_on = current_date;
  if msg = 'open' and n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B06 agent ' || msg || ', eigenaar ' || n; end if;

  -- B07 na uitbetaling niet opnieuw uitrekenen of terugzetten
  n := 0;
  begin perform public.make_statement(c, current_date); exception when others then n := n + 1; end;
  begin update public.owner_statements set status = 'open' where id = st; exception when others then n := n + 1; end;
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B07 ' || n || ' van 2 geweigerd'; end if;

  -- B08 een viewer ziet geen contracten of afrekeningen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.management_contracts where org_id = org_a;
  select n + count(*) into n from public.owner_statements where org_id = org_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - B08 viewer ziet ' || n; end if;

  -- B09 de eigenaar ziet de afrekening in zijn portaal
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tok := public.create_owner_link(ow);
  reset role;
  set local role anon;
  j := public.public_owner_portal(tok);
  reset role;
  if jsonb_array_length(j->'statements') = 1 and (j->'statements'->0->>'payout_cents')::bigint = 870000 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - B09 ' || coalesce((j->'statements')::text, 'null'); end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
