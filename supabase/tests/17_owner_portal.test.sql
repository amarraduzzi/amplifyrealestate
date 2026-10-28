-- Test voor etappe 7a: het eigenaarsportaal.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000600_owner_portal.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; ow uuid; ow2 uuid; tenant uuid; buyer uuid; lead uuid; pr1 uuid; pr2 uuid; pr_other uuid;
  tok text; tok2 text; j jsonb; msg text; n int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'op-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'op-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'op-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Portal Kantoor B', 'portal-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Portal Kantoor A', 'portal-kantoor-a');
  perform public.add_member(org_a, 'op-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Rachid Amrani') returning id into ow;
  insert into public.people (org_id, full_name) values (org_a, 'Andere Eigenaar') returning id into ow2;
  insert into public.people (org_id, full_name) values (org_a, 'Huurder Adil') returning id into tenant;
  insert into public.people (org_id, full_name, phone) values (org_a, 'Geheime Koper', '0611111111') returning id into buyer;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Villa Harhoura', 'sale', 'available') returning id into pr1;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Appartement Agdal', 'rent_long', 'available') returning id into pr2;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Niet van hem', 'sale', 'available') returning id into pr_other;
  insert into public.property_parties (org_id, property_id, person_id, role) values (org_a, pr1, ow, 'owner'), (org_a, pr2, ow, 'owner'), (org_a, pr_other, ow2, 'owner');
  insert into public.leads (org_id, person_id, purpose) values (org_a, buyer, 'sale') returning id into lead;
  insert into public.viewings (org_id, lead_id, property_id, scheduled_at, status, outcome) values (org_a, lead, pr1, now() - interval '2 days', 'done', 'interested');
  insert into public.deals (org_id, lead_id, property_id, price_cents, commission_cents) values (org_a, lead, pr1, 400000000, 9999900);
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, pr2, tenant, 800000, current_date);
  perform public.generate_rent_due(org_a);

  -- O01 een link maken voor een eigenaar
  tok := public.create_owner_link(ow, 'nl');
  if tok ~ '^[0-9a-f]{64}$' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - O01 code ' || coalesce(tok, '-'); end if;

  -- O02 geen link voor iemand die geen eigenaar is
  begin perform public.create_owner_link(buyer); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'owner_has_no_property' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - O02 ' || coalesce(msg, 'geen fout'); end if;

  -- Als bezoeker met de link
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  j := public.public_owner_portal(tok);

  -- O03 zijn twee panden, niet dat van een ander, in zijn taal
  if jsonb_array_length(j->'properties') = 2 and position('Niet van hem' in j::text) = 0 and j->>'lang' = 'nl' and j->'owner'->>'name' = 'Rachid Amrani' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - O03 ' || coalesce(j::text, 'null'); end if;

  -- O04 activiteit zonder namen, nummers of commissie
  if position('Geheime Koper' in j::text) = 0 and position('0611111111' in j::text) = 0 and position('9999900' in j::text) = 0
     and exists (select 1 from jsonb_array_elements(j->'properties') e where (e->>'interested')::int = 1 and (e->>'offers')::int = 1) then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - O04 te veel of te weinig getoond'; end if;

  -- O05 huur met huurder en maandregels
  if exists (select 1 from jsonb_array_elements(j->'properties') e where e->'lease'->>'tenant' = 'Huurder Adil' and jsonb_array_length(e->'lease'->'payments') >= 1) then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - O05 huur ontbreekt'; end if;

  -- O06 een verzonnen of verkeerde code geeft niets
  if public.public_owner_portal(repeat('a', 64)) is null and public.public_owner_portal('kort') is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - O06 verkeerde code gaf toegang'; end if;
  reset role;

  -- O07 een nieuwe link maakt de oude ongeldig; intrekken maakt alles ongeldig
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tok2 := public.create_owner_link(ow);
  reset role;
  set local role anon;
  n := (public.public_owner_portal(tok) is null)::int + (public.public_owner_portal(tok2) is not null)::int;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.revoke_owner_link(ow);
  reset role;
  set local role anon;
  n := n + (public.public_owner_portal(tok2) is null)::int;
  reset role;
  if n = 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - O07 ' || n || ' van 3'; end if;

  -- O08 viewer en ander kantoor kunnen geen link maken en zien de links niet
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_owner_link(ow); msg := null; exception when others then msg := sqlerrm; end;
  select count(*) into n from public.owner_links where org_id = org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select n + count(*) into n from public.owner_links where org_id = org_a;
  reset role;
  if msg is not null and n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - O08 ziet ' || n; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
