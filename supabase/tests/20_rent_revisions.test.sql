-- Test voor etappe 7d: huurverhoging.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000900_rent_revisions.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 7 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; tenant uuid; pr_home uuid; pr_shop uuid; l_new uuid; l_old uuid; l_shop uuid; pay uuid;
  msg text; n bigint; j jsonb;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'rr-a@test.invalid', 'authenticated', 'authenticated'), (uv, 'rr-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Huur Kantoor', 'huur-kantoor');
  perform public.add_member(org_a, 'rr-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Huurder') returning id into tenant;
  insert into public.properties (org_id, title, purpose, status, property_type) values (org_a, 'Huis', 'rent_long', 'available', 'apartment') returning id into pr_home;
  insert into public.properties (org_id, title, purpose, status, property_type) values (org_a, 'Winkel', 'rent_long', 'available', 'shop') returning id into pr_shop;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, pr_home, tenant, 500000, current_date - 400) returning id into l_new;
  insert into public.properties (org_id, title, purpose, status, property_type) values (org_a, 'Oud huis', 'rent_long', 'available', 'villa') returning id into l_old;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, l_old, tenant, 1000000, current_date - 1200) returning id into l_old;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, pr_shop, tenant, 1000000, current_date - 1200) returning id into l_shop;

  -- R01 binnen drie jaar: geen verhoging
  begin perform public.revise_rent(l_new, 520000); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'rent_revision_too_soon' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R01 ' || coalesce(msg, 'geen fout'); end if;

  -- R02 een verlaging mag altijd
  perform public.revise_rent(l_new, 480000, 'Geste commercial');
  select rent_cents into n from public.leases where id = l_new;
  if n = 480000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R02 ' || n; end if;

  -- R03 na drie jaar: woning hooguit 8%
  begin perform public.revise_rent(l_old, 1090000); msg := null; exception when others then msg := sqlerrm; end;
  perform public.revise_rent(l_old, 1080000);
  select rent_cents into n from public.leases where id = l_old;
  if msg = 'rent_revision_too_high' and n = 1080000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R03 ' || coalesce(msg, '-') || ' ' || n; end if;

  -- R04 daarna weer drie jaar wachten
  begin perform public.revise_rent(l_old, 1100000); msg := null; exception when others then msg := sqlerrm; end;
  j := public.rent_revision_rule(l_old);
  if msg = 'rent_revision_too_soon' and (j->>'next')::date = current_date + interval '3 years' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - R04 ' || coalesce(msg, '-') || ' ' || coalesce(j::text, '-'); end if;

  -- R05 winkel: hooguit 10%
  perform public.revise_rent(l_shop, 1100000);
  select rent_cents into n from public.leases where id = l_shop;
  if n = 1100000 and (public.rent_revision_rule(l_shop)->>'max_pct')::int = 10 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R05 ' || n; end if;

  -- R06 openstaande maandhuur in de toekomst krijgt het nieuwe bedrag
  reset role;
  insert into public.rent_payments (org_id, lease_id, due_date, amount_cents) values (org_a, l_new, current_date + 10, 480000) returning id into pay;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.revise_rent(l_new, 450000);
  select amount_cents into n from public.rent_payments where id = pay;
  if n = 450000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R06 ' || n; end if;

  -- R07 een viewer kan de huur niet herzien
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.revise_rent(l_new, 400000); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R07 viewer kon herzien'; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
