-- Test voor etappe 7c: état des lieux.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000800_inspections.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 7 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; tenant uuid; pr uuid; ls uuid; i1 uuid; ph uuid; msg text; n int; st text;
  sig text := 'data:image/png;base64,iVBORw0KGgo=';
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ed-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'ed-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'ed-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Edl Kantoor B', 'edl-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Edl Kantoor A', 'edl-kantoor-a');
  perform public.add_member(org_a, 'ed-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Huurder') returning id into tenant;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Appartement', 'rent_long', 'available') returning id into pr;
  insert into public.leases (org_id, property_id, tenant_person_id, rent_cents, start_date) values (org_a, pr, tenant, 500000, current_date) returning id into ls;

  -- E01 état des lieux d'entrée met kamers, meterstanden en een foto
  insert into public.inspections (org_id, lease_id, kind, rooms, meters)
    values (org_a, ls, 'entry', '[{"name": "Salon", "items": [{"label": "Murs", "condition": "good"}]}]', '{"water": "123"}') returning id into i1;
  insert into public.inspection_photos (org_id, inspection_id, room) values (org_a, i1, 0) returning id into ph;
  if i1 is not null and ph is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E01'; end if;

  -- E02 geen tweede état des lieux d'entrée voor dezelfde huur
  begin insert into public.inspections (org_id, lease_id, kind) values (org_a, ls, 'entry'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E02 tweede toegestaan'; end if;

  -- E03 ondertekenen zonder handtekeningen kan niet; met beide wel
  begin perform public.sign_inspection(i1, 'Huurder', null, 'Agent', sig); msg := null; exception when others then msg := sqlerrm; end;
  perform public.sign_inspection(i1, 'Huurder', sig, 'Agent', sig);
  select status::text into st from public.inspections where id = i1;
  if msg = 'inspection_signatures_missing' and st = 'signed' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E03 ' || coalesce(msg, '-') || ' ' || st; end if;

  -- E04 na ondertekening: inhoud, foto's en handtekening liggen vast
  n := 0;
  begin update public.inspections set general_note = 'gewijzigd' where id = i1; exception when others then n := n + 1; end;
  begin insert into public.inspection_photos (org_id, inspection_id, room) values (org_a, i1, 0); exception when others then n := n + 1; end;
  begin delete from public.inspection_photos where id = ph; exception when others then n := n + 1; end;
  begin perform public.sign_inspection(i1, 'X', sig, 'Y', sig); exception when others then n := n + 1; end;
  if n = 4 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E04 ' || n || ' van 4 geweigerd'; end if;

  -- E05 état des lieux de sortie kan ernaast
  insert into public.inspections (org_id, lease_id, kind) values (org_a, ls, 'exit');
  select count(*) into n from public.inspections where lease_id = ls;
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E05 ' || n; end if;

  -- E06 viewer en ander kantoor zien niets
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.inspections where org_id = org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select n + count(*) into n from public.inspections where org_id = org_a;
  select n + count(*) into n from public.inspection_photos where org_id = org_a;
  begin insert into public.inspections (org_id, lease_id, kind) values (org_b, ls, 'exit'); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E06 ziet ' || n; end if;

  -- E07 plan afgelopen: niet meer ondertekenen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.sign_inspection((select id from public.inspections where lease_id = ls and kind = 'exit'), 'H', sig, 'A', sig); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'plan_expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E07 ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
