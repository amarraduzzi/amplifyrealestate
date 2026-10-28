-- Test voor etappe 10d: verkoper bij een verkoop.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000400_dev_report.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 4 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  org_a uuid; pr uuid; u1 uuid; buyer uuid; s1 uuid; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'dr-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'dr-g@test.invalid', 'authenticated', 'authenticated'),
    (ux, 'dr-x@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Promoteur Rapport', 'promoteur-rapport');
  perform public.add_member(org_a, 'dr-g@test.invalid', 'agent');
  insert into public.people (org_id, full_name) values (org_a, 'Koper') returning id into buyer;
  insert into public.dev_projects (org_id, name) values (org_a, 'Projet') returning id into pr;
  perform public.add_dev_units(pr, null, 'A', 1, 1, 2);
  reset role;

  -- R01 wie de verkoop maakt is de verkoper
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into u1 from public.dev_units where project_id = pr and reference = 'A-101';
  s1 := public.create_dev_sale(u1, buyer, 1000000, 'reservation', '[{"milestone":"deed","pct":100}]');
  if (select seller_user_id from public.dev_sales where id = s1) = ug then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R01 verkoper niet gezet'; end if;

  -- R02 een agent kan de verkoper niet wijzigen
  begin update public.dev_sales set seller_user_id = ua where id = s1; msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'seller_manager_only' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R02 ' || coalesce(msg, 'geen fout'); end if;
  reset role;

  -- R03 de eigenaar wel, maar alleen naar een lid van het kantoor
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.dev_sales set seller_user_id = ua where id = s1;
  if (select seller_user_id from public.dev_sales where id = s1) = ua then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R03 niet gewijzigd'; end if;

  -- R04 een buitenstaander als verkoper kan niet
  begin update public.dev_sales set seller_user_id = ux where id = s1; msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'seller_not_member' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R04 ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
