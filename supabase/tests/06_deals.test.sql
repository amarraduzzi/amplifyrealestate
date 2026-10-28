-- Test voor etappe 2a: deals (transacties) met commissie.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001000_deals.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 12 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  org_a uuid; org_b uuid;
  person_a uuid; person_a2 uuid; person_b uuid;
  lead_a uuid; lead_a2 uuid; lead_b uuid;
  prop_sale uuid; prop_rent uuid; prop_b uuid;
  d1 uuid; d2 uuid; d3 uuid;
  st text; n int; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'deal-a@test.invalid', 'authenticated', 'authenticated'),
    (ub, 'deal-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'deal-v@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Deal Kantoor B', 'deal-kantoor-b', 'Casablanca');
  insert into public.people (org_id, full_name) values (org_b, 'Klant B') returning id into person_b;
  insert into public.leads (org_id, person_id, purpose) values (org_b, person_b, 'sale') returning id into lead_b;
  insert into public.properties (org_id, title, purpose, status) values (org_b, 'Pand B', 'sale', 'available') returning id into prop_b;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Deal Kantoor A', 'deal-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'deal-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Koper A') returning id into person_a;
  insert into public.people (org_id, full_name) values (org_a, 'Koper A2') returning id into person_a2;
  insert into public.leads (org_id, person_id, purpose) values (org_a, person_a, 'sale') returning id into lead_a;
  insert into public.leads (org_id, person_id, purpose) values (org_a, person_a2, 'sale') returning id into lead_a2;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Villa te koop', 'sale', 'available') returning id into prop_sale;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Huur', 'rent_long', 'available') returning id into prop_rent;

  -- D01 een bod aanmaken
  insert into public.deals (org_id, lead_id, property_id, price_cents, commission_pct, commission_cents)
    values (org_a, lead_a, prop_sale, 200000000, 2.5, 5000000) returning id into d1;
  select stage::text into st from public.deals where id = d1;
  if st = 'offer' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D01 bod: ' || coalesce(st, '-'); end if;

  -- D02 een tweede lopende deal voor dezelfde lead en hetzelfde pand kan niet
  begin insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_a, prop_sale, 190000000); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D02 dubbele deal toegestaan'; end if;

  -- D03 akkoord reserveert het pand
  update public.deals set stage = 'accepted' where id = d1;
  select status::text into st from public.properties where id = prop_sale;
  if st = 'reserved' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D03 pand na akkoord: ' || st; end if;

  -- D04 niet doorgegaan na akkoord: pand weer beschikbaar
  update public.deals set stage = 'lost', lost_reason = 'Financiering' where id = d1;
  select status::text into st from public.properties where id = prop_sale;
  if st = 'available' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D04 pand na lost: ' || st; end if;

  -- D05 niet beschikbaar maken als er nog een andere deal in akkoord is
  insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_a2, prop_sale, 195000000) returning id into d2;
  update public.deals set stage = 'accepted' where id = d2;
  insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_a, prop_sale, 198000000) returning id into d3;
  update public.deals set stage = 'accepted' where id = d3;
  update public.deals set stage = 'lost' where id = d3;
  select status::text into st from public.properties where id = prop_sale;
  if st = 'reserved' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D05 pand met andere akkoord-deal: ' || st; end if;

  -- D06 getekend bij koop: pand verkocht, lead gewonnen, tijdstip vastgelegd
  update public.deals set stage = 'signed' where id = d2;
  select p.status::text || '/' || l.status::text || '/' || (d.signed_at is not null)::text into st
    from public.deals d join public.properties p on p.id = d.property_id join public.leads l on l.id = d.lead_id where d.id = d2;
  if st = 'sold/won/true' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D06 getekend: ' || st; end if;

  -- D07 getekend bij huur: pand verhuurd
  insert into public.deals (org_id, lead_id, property_id, price_cents, stage) values (org_a, lead_a, prop_rent, 800000, 'signed');
  select status::text into st from public.properties where id = prop_rent;
  if st = 'rented' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D07 huur getekend: ' || st; end if;

  -- D08 lead en pand van een deal staan vast
  begin update public.deals set property_id = prop_rent where id = d2; msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D08 pand van deal gewijzigd'; end if;

  -- D09 verwijzen naar een lead van een ander kantoor kan niet
  begin insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_b, prop_sale, 100); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D09 lead van ander kantoor gebruikt'; end if;

  -- D10 kantoor B ziet de deals van A niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deals where org_id = org_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D10 B ziet ' || n || ' deals van A'; end if;

  -- D11 een viewer kan geen deal aanmaken
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_a2, prop_rent, 100); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D11 viewer maakte een deal'; end if;

  -- D12 plan afgelopen: niets meer wijzigen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.deals set stage = 'paid' where id = d2;
  select stage::text into st from public.deals where id = d2;
  if st = 'signed' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - D12 na afloop plan: ' || st; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
