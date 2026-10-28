-- Test voor etappe 6c: nieuwe matches (gestuurd of overgeslagen).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000100_match_notices.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; pa uuid; pb uuid; lead_a uuid; prop_a uuid; prop_a2 uuid; prop_b uuid;
  n int; st text; msg text; t0 timestamptz;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'mn-a@test.invalid', 'authenticated', 'authenticated'),
    (ub, 'mn-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'mn-v@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Match Kantoor B', 'match-kantoor-b');
  insert into public.properties (org_id, title, purpose, status) values (org_b, 'Pand B', 'sale', 'available') returning id into prop_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Match Kantoor A', 'match-kantoor-a');
  perform public.add_member(org_a, 'mn-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Klant') returning id into pa;
  insert into public.leads (org_id, person_id, purpose) values (org_a, pa, 'sale') returning id into lead_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 1', 'sale', 'available') returning id into prop_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 2', 'sale', 'available') returning id into prop_a2;
  reset role;
  update public.leads set last_contact_at = now() - interval '20 days' where id = lead_a;
  select last_contact_at into t0 from public.leads where id = lead_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- M01 sturen markeert de panden en telt als contact
  select public.mark_matches(lead_a, array[prop_a, prop_a2], 'sent') into n;
  if n = 2 and (select last_contact_at from public.leads where id = lead_a) > t0 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - M01 gestuurd ' || n; end if;

  -- M02 nog eens markeren overschrijft (geen dubbel)
  perform public.mark_matches(lead_a, array[prop_a], 'dismissed');
  select count(*), max(status::text) into n, st from public.match_notices where lead_id = lead_a and property_id = prop_a;
  if n = 1 and st = 'dismissed' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - M02 ' || n || ' ' || st; end if;

  -- M03 een pand van een ander kantoor wordt genegeerd
  select public.mark_matches(lead_a, array[prop_b], 'sent') into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - M03 pand van ander kantoor gemarkeerd'; end if;

  -- M04 kantoor B ziet de markeringen van A niet en kan ze niet zetten
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.match_notices where org_id = org_a;
  begin perform public.mark_matches(lead_a, array[prop_a], 'sent'); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - M04 B ziet ' || n || ', fout ' || coalesce(msg, 'geen'); end if;

  -- M05 een viewer mag niet markeren
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.mark_matches(lead_a, array[prop_a], 'sent'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - M05 viewer kon markeren'; end if;

  -- M06 plan afgelopen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.mark_matches(lead_a, array[prop_a], 'sent'); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'plan_expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - M06 ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
