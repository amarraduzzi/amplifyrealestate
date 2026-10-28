-- Test voor etappe 10a: promoteurs (projecten, tranches, voorraad).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000100_projects.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  org_a uuid; org_b uuid; pr uuid; pr2 uuid; tr uuid; tr2 uuid; u1 uuid; buyer uuid;
  n bigint; m bigint; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'pr-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'pr-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'pr-v@test.invalid', 'authenticated', 'authenticated'), (ug, 'pr-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Promoteur B', 'promoteur-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Promoteur A', 'promoteur-a');
  perform public.add_member(org_a, 'pr-v@test.invalid', 'viewer');
  perform public.add_member(org_a, 'pr-g@test.invalid', 'agent');
  insert into public.people (org_id, full_name, phone) values (org_a, 'Koper Een', '0600000000') returning id into buyer;
  insert into public.dev_projects (org_id, name, city) values (org_a, 'Les Jardins de Harhoura', 'Témara') returning id into pr;
  insert into public.dev_projects (org_id, name) values (org_a, 'Ander project') returning id into pr2;
  insert into public.dev_tranches (org_id, project_id, name) values (org_a, pr, 'Tranche 1') returning id into tr;
  insert into public.dev_tranches (org_id, project_id, name) values (org_a, pr2, 'Tranche X') returning id into tr2;

  -- P01 een reeks kavels: gebouw A, rez-de-chaussée tot 4e, 4 per verdieping = 20, met de juiste referenties
  n := public.add_dev_units(pr, tr, 'A', 0, 4, 4, 'apartment', 2, 85, 95000000);
  if n = 20 and exists (select 1 from public.dev_units where project_id = pr and reference = 'A-001')
     and exists (select 1 from public.dev_units where project_id = pr and reference = 'A-404') then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - P01 aantal ' || n; end if;

  -- P02 dezelfde reeks nog een keer kan niet (referenties bestaan al), en er komt niets half bij
  begin perform public.add_dev_units(pr, tr, 'A', 4, 5, 4); msg := null; exception when others then msg := sqlerrm; end;
  select count(*) into n from public.dev_units where project_id = pr;
  if msg = 'unit_reference_taken' and n = 20 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P02 ' || coalesce(msg, 'geen fout') || ' ' || n; end if;

  -- P03 meer dan 500 in een keer kan niet
  begin perform public.add_dev_units(pr, null, 'Z', 1, 100, 6); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'units_too_many' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P03 ' || coalesce(msg, 'geen fout'); end if;

  -- P04 een tranche van een ander project kan niet
  select id into u1 from public.dev_units where project_id = pr and reference = 'A-101';
  begin update public.dev_units set tranche_id = tr2 where id = u1; msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'unit_tranche_other_project' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P04 ' || coalesce(msg, 'geen fout'); end if;

  -- P05 verkopen met koper; daarna kan een agent de verkoop niet terugdraaien
  update public.dev_units set status = 'sold', buyer_person_id = buyer where id = u1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.dev_units set status = 'available' where id = u1; msg := null; exception when others then msg := sqlerrm; end;
  delete from public.dev_units where id = u1;
  if msg = 'unit_sold_locked' and exists (select 1 from public.dev_units where id = u1) then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - P05 ' || coalesce(msg, 'geen fout'); end if;

  -- P06 de eigenaar mag het wel (bijvoorbeeld een geannuleerde verkoop)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.dev_units set status = 'available', buyer_person_id = null where id = u1;
  if (select status::text from public.dev_units where id = u1) = 'available' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P06 niet terug op vrij'; end if;
  update public.dev_units set status = 'sold', buyer_person_id = buyer where id = u1;

  -- P07 een viewer ziet de voorraad maar niet de koper
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dev_units where project_id = pr;
  select count(*) into m from public.dev_unit_buyers(pr);
  if n = 20 and m = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P07 kavels ' || n || ', kopers ' || m; end if;

  -- P08 een ander kantoor ziet niets en kan geen kavels maken
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dev_units where project_id = pr;
  begin perform public.add_dev_units(pr, null, 'B', 1, 1, 1); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P08 ziet ' || n; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
