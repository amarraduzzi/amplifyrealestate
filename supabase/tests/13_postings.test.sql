-- Test voor etappe 6d: advertenties per pand.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000200_postings.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; prop_a uuid; pid uuid;
  n int; st text; d date; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'po-a@test.invalid', 'authenticated', 'authenticated'),
    (ub, 'po-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'po-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Post Kantoor B', 'post-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Post Kantoor A', 'post-kantoor-a');
  perform public.add_member(org_a, 'po-v@test.invalid', 'viewer');
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand', 'sale', 'available') returning id into prop_a;

  -- P01 advertentie vastleggen
  insert into public.property_postings (org_id, property_id, site, url) values (org_a, prop_a, 'mubawab', 'https://www.mubawab.ma/fr/a/123') returning id into pid;
  select status::text into st from public.property_postings where id = pid;
  if st = 'online' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P01 ' || coalesce(st, '-'); end if;

  -- P02 tweede keer dezelfde site kan niet
  begin insert into public.property_postings (org_id, property_id, site) values (org_a, prop_a, 'mubawab'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P02 dubbel toegestaan'; end if;

  -- P03 offline halen zet de datum
  update public.property_postings set status = 'removed' where id = pid;
  select removed_on into d from public.property_postings where id = pid;
  if d = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P03 removed_on ' || coalesce(d::text, '-'); end if;

  -- P04 een viewer kan niets toevoegen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.property_postings (org_id, property_id, site) values (org_a, prop_a, 'avito'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P04 viewer voegde toe'; end if;

  -- P05 een ander kantoor ziet en wijzigt niets
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.property_postings where org_id = org_a;
  begin insert into public.property_postings (org_id, property_id, site) values (org_b, prop_a, 'avito'); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P05 B ziet ' || n || ', fout ' || coalesce(msg, 'geen'); end if;

  -- P06 plan afgelopen: niets meer toevoegen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.property_postings (org_id, property_id, site) values (org_a, prop_a, 'avito'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - P06 na afloop plan toegevoegd'; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
