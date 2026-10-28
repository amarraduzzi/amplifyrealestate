-- Test voor etappe 6g: de kantoorwebsite.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000500_website.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  org_a uuid; org_b uuid; j jsonb; st text; msg text; n int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ws-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'ws-b@test.invalid', 'authenticated', 'authenticated'),
    (ug, 'ws-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Web Kantoor B', 'web-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Web Kantoor A', 'web-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'ws-g@test.invalid', 'agent');
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Verkocht', 'sale', 'sold'), (org_a, 'Verhuurd', 'rent_long', 'rented');

  -- W01 eigenaar zet teksten en domein; het domein wordt opgeschoond
  update public.organizations set site_tagline = 'Votre agence à Rabat', site_about = 'Depuis 2010', custom_domain = 'https://WWW.Web-A.ma/' where id = org_a;
  select custom_domain into st from public.organizations where id = org_a;
  if st = 'www.web-a.ma' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - W01 domein ' || coalesce(st, '-'); end if;

  -- W02 een agent kan de website niet wijzigen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.organizations set site_tagline = 'Gewijzigd' where id = org_a;
  reset role;
  select site_tagline into st from public.organizations where id = org_a;
  if st = 'Votre agence à Rabat' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - W02 ' || st; end if;

  -- W03 hetzelfde domein kan niet bij twee kantoren
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.organizations set custom_domain = 'www.web-a.ma' where id = org_b; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - W03 dubbel domein toegestaan'; end if;
  reset role;

  -- W04 domein naar kantoorcode, met en zonder www., als bezoeker
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  if public.public_office_by_domain('web-a.ma') = 'web-kantoor-a' and public.public_office_by_domain('WWW.web-a.ma') = 'web-kantoor-a'
     and public.public_office_by_domain('onbekend.ma') is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - W04 domein opzoeken'; end if;

  -- W05 de kantoorpagina geeft de websiteteksten en het aantal verkocht of verhuurd
  j := public.public_office_page('web-kantoor-a');
  if j->'site'->>'tagline' = 'Votre agence à Rabat' and (j->'site'->>'done')::int = 2 and j->'office'->>'domain' = 'www.web-a.ma' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - W05 ' || coalesce(j::text, 'null'); end if;

  -- W06 ongeldig domein wordt geweigerd
  reset role;
  begin update public.organizations set custom_domain = 'geen domein' where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - W06 ongeldig domein toegestaan'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
