-- Test voor etappe 10c: verkoopteam, leads per project en de publieke projectpagina.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000300_project_page.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  org_a uuid; pr uuid; hidden uuid; buyer uuid; u1 uuid; d jsonb;
  n bigint; m bigint; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'pp-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'pp-g@test.invalid', 'authenticated', 'authenticated'),
    (ux, 'pp-x@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Promoteur Page', 'promoteur-page');
  perform public.add_member(org_a, 'pp-g@test.invalid', 'agent');
  insert into public.people (org_id, full_name) values (org_a, 'Koper') returning id into buyer;
  insert into public.dev_projects (org_id, name, city, slug, published, show_prices) values (org_a, 'Les Jardins', 'Témara', 'les-jardins', true, true) returning id into pr;
  insert into public.dev_projects (org_id, name, slug) values (org_a, 'Verborgen', 'verborgen') returning id into hidden;
  perform public.add_dev_units(pr, null, 'A', 1, 1, 3, 'apartment', 2, 80, 90000000);
  perform public.add_dev_units(hidden, null, 'A', 1, 1, 1);
  select id into u1 from public.dev_units where project_id = pr and reference = 'A-101';
  perform public.create_dev_sale(u1, buyer, 90000000, 'reservation', '[{"milestone":"deed","pct":100}]');
  insert into public.dev_project_team (project_id, org_id, user_id) values (pr, org_a, ug);

  -- T01 publiceren zonder slug kan niet
  begin insert into public.dev_projects (org_id, name, published) values (org_a, 'Zonder slug', true); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T01 gepubliceerd zonder slug'; end if;

  -- T02 iemand die geen lid is kan niet in het team
  begin insert into public.dev_project_team (project_id, org_id, user_id) values (pr, org_a, ux); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'team_not_member' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T02 ' || coalesce(msg, 'geen fout'); end if;
  reset role;

  -- T03 een bezoeker ziet het gepubliceerde project met alleen de vrije lots, en geen kopers
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  d := public.public_project_page('promoteur-page', 'les-jardins');
  if d is not null and jsonb_array_length(d->'units') = 2 and (d->'project'->>'total_units')::int = 3 and d::text not like '%Koper%' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - T03 ' || coalesce(d::text, 'null'); end if;

  -- T04 een niet gepubliceerd project bestaat niet voor bezoekers, ook niet in de lijst van het kantoor
  d := public.public_office_projects('promoteur-page');
  if public.public_project_page('promoteur-page', 'verborgen') is null and jsonb_array_length(d) = 1 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - T04 lijst ' || d::text; end if;

  -- T05 een aanvraag maakt een lead bij het project en een taak voor het teamlid
  perform public.submit_project_inquiry('promoteur-page', 'les-jardins', 'Nadia Test', '0612345678', 'Un F3 svp', 'A-102');
  reset role;
  select count(*) into n from public.leads where org_id = org_a and project_id = pr and source = 'public_page';
  select count(*) into m from public.tasks where org_id = org_a and assigned_to = ug and title like 'Rappeler Nadia Test%';
  if n = 1 and m = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T05 leads ' || n || ' taken ' || m; end if;

  -- T06 dezelfde persoon binnen 10 minuten: geen tweede lead
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform public.submit_project_inquiry('promoteur-page', 'les-jardins', 'Nadia Test', '+212 6 12 34 56 78', 'Encore');
  reset role;
  select count(*) into n from public.leads where org_id = org_a and project_id = pr;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T06 leads ' || n; end if;

  -- T07 honingpot en ongeldig nummer
  set local role anon;
  perform public.submit_project_inquiry('promoteur-page', 'les-jardins', 'Robot', '0699999999', 'x', null, 'http://spam');
  begin perform public.submit_project_inquiry('promoteur-page', 'les-jardins', 'Kort', '12', 'x'); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  select count(*) into n from public.people where org_id = org_a and full_name = 'Robot';
  if n = 0 and msg = 'inquiry_invalid' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T07 robot ' || n || ' ' || coalesce(msg, 'geen fout'); end if;

  -- T08 prijzen verbergen: geen prijzen op de pagina en in de lijst
  update public.dev_projects set show_prices = false where id = pr;
  set local role anon;
  d := public.public_project_page('promoteur-page', 'les-jardins');
  if d->'units'->0->>'price_cents' is null and public.public_office_projects('promoteur-page')->0->>'price_from' is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - T08 prijs zichtbaar'; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
