-- Test voor etappe 10b: verkoop, reservering en betalingsschema (VEFA).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000200_dev_sales.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  org_a uuid; pr uuid; u1 uuid; u2 uuid; u3 uuid; buyer uuid; s1 uuid; s2 uuid;
  vefa jsonb := '[{"label":"Contrat préliminaire","milestone":"contract","pct":5},{"label":"Fondations","milestone":"foundations","pct":25},
                  {"label":"Gros œuvre","milestone":"structure","pct":30},{"label":"Finitions","milestone":"finishing","pct":20},
                  {"label":"Remise des clés","milestone":"keys","pct":20}]';
  n bigint; m bigint; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'ds-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'ds-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'ds-v@test.invalid', 'authenticated', 'authenticated'), (ug, 'ds-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_organization('Promoteur B', 'verkoop-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Promoteur A', 'verkoop-a');
  perform public.add_member(org_a, 'ds-v@test.invalid', 'viewer');
  perform public.add_member(org_a, 'ds-g@test.invalid', 'agent');
  insert into public.people (org_id, full_name) values (org_a, 'Koper') returning id into buyer;
  insert into public.dev_projects (org_id, name) values (org_a, 'Projet VEFA') returning id into pr;
  perform public.add_dev_units(pr, null, 'A', 1, 1, 3, 'apartment', 2, 80, 100000033);
  select id into u1 from public.dev_units where project_id = pr and reference = 'A-101';
  select id into u2 from public.dev_units where project_id = pr and reference = 'A-102';
  select id into u3 from public.dev_units where project_id = pr and reference = 'A-103';

  -- V01 VEFA-schema: termijnen tellen precies op tot de prijs, het lot staat op gereserveerd met de koper
  s1 := public.create_dev_sale(u1, buyer, 100000033, 'vefa', vefa);
  select sum(amount_cents), count(*) into n, m from public.dev_installments where sale_id = s1;
  if n = 100000033 and m = 5 and (select status::text from public.dev_units where id = u1) = 'reserved' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - V01 som ' || n || ' termijnen ' || m; end if;

  -- V02 meer dan 5% bij het contrat préliminaire is geen VEFA
  begin perform public.create_dev_sale(u2, buyer, 1000000, 'vefa',
    '[{"milestone":"contract","pct":10},{"milestone":"structure","pct":70},{"milestone":"keys","pct":20}]'); msg := null;
  exception when others then msg := sqlerrm; end;
  if msg = 'schedule_not_vefa' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V02 ' || coalesce(msg, 'geen fout'); end if;

  -- V03 een schema dat niet op 100% uitkomt kan niet; een gewone reservering met 10% acompte wel
  begin perform public.create_dev_sale(u2, buyer, 1000000, 'reservation', '[{"milestone":"contract","pct":10},{"milestone":"deed","pct":80}]'); msg := null;
  exception when others then msg := sqlerrm; end;
  s2 := public.create_dev_sale(u2, buyer, 1000000, 'reservation', '[{"label":"Acompte","milestone":"contract","pct":10},{"label":"Solde chez le notaire","milestone":"deed","pct":90}]');
  if msg = 'schedule_not_100' and s2 is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V03 ' || coalesce(msg, 'geen fout'); end if;

  -- V04 een tweede verkoop op hetzelfde lot kan niet
  begin perform public.create_dev_sale(u1, buyer, 1000000, 'reservation', '[{"milestone":"deed","pct":100}]'); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'unit_not_available' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V04 ' || coalesce(msg, 'geen fout'); end if;

  -- V05 een lot met een lopende verkoop kan niet met de hand op vrij; het bedrag van een termijn ligt vast
  begin update public.dev_units set status = 'available' where id = u1; msg := null; exception when others then msg := sqlerrm; end;
  begin update public.dev_installments set amount_cents = 1 where sale_id = s1 and position = 1; m := 0; exception when others then m := 1; end;
  if msg = 'unit_has_sale' and m = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V05 ' || coalesce(msg, 'geen fout'); end if;

  -- V06 tekenen zet het lot op verkocht; een agent kan een getekende verkoop niet annuleren
  perform public.sign_dev_sale(s1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.cancel_dev_sale(s1); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'unit_sold_locked' and (select status::text from public.dev_units where id = u1) = 'sold' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - V06 ' || coalesce(msg, 'geen fout'); end if;

  -- V07 de eigenaar annuleert: lot weer vrij zonder koper, en een nieuwe verkoop kan
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cancel_dev_sale(s1);
  select count(*) into n from public.dev_units where id = u1 and status = 'available' and not exists (select 1 from public.dev_unit_buyers(pr) b where b.unit_id = u1);
  perform public.create_dev_sale(u1, buyer, 900000, 'reservation', '[{"milestone":"deed","pct":100}]');
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V07 lot niet vrij'; end if;

  -- V08 een viewer ziet geen verkopen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dev_sales where org_id = org_a;
  select count(*) into m from public.dev_installments where org_id = org_a;
  if n = 0 and m = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V08 ziet ' || n || '/' || m; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
