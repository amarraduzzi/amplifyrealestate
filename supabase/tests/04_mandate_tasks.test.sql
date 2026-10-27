-- Test voor etappe 1k: automatische taken bij aflopende en verlopen mandaten.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027000800_mandate_tasks.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 17 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  org_a uuid; org_b uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
  m1 uuid;
  n int; d date; t text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',  'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',  'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid', 'viewer');

  -- panden en mandaten
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 1', 'sale', 'available') returning id into p1;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p1, 'active', current_date + 10) returning id into m1;        -- bijna verlopen
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 2', 'sale', 'available') returning id into p2;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p2, 'active', current_date + 90);                              -- ver weg
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 3', 'sale', 'available') returning id into p3;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p3, 'active', null);                                          -- loopt nooit af
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 4', 'sale', 'available') returning id into p4;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p4, 'active', current_date - 5);                              -- verlopen op datum
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 5', 'sale', 'reserved') returning id into p5;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p5, 'active', current_date + 5), (org_a, p5, 'active', null);  -- een mandaat zonder einde
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 6', 'sale', 'sold') returning id into p6;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p6, 'active', current_date + 2);                              -- verkocht: geen taak
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 7', 'sale', 'available') returning id into p7;
  insert into public.property_mandates (org_id, property_id, status, valid_until, revoked_at) values (org_a, p7, 'revoked', current_date - 30, now());          -- alleen ingetrokken
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 8', 'sale', 'available') returning id into p8;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p8, 'active', current_date + 20), (org_a, p8, 'active', current_date + 25);  -- laatste telt
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 9', 'sale', 'available') returning id into p9;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p9, 'active', current_date - 40), (org_a, p9, 'active', current_date + 60);  -- oud verlopen, nieuw geldig
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand 10', 'sale', 'available') returning id into p10;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, p10, 'active', current_date + 3);                             -- deadline niet in het verleden

  -- K01 eerste keer: taken voor pand 1, 4, 8 en 10
  n := public.sync_mandate_tasks(org_a, 'Verleng mandaat');
  if n = 4 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K01 verwacht 4 taken, kreeg ' || n; end if;

  -- K02 precies de juiste panden
  select count(*) into n from public.tasks where org_id = org_a and property_id in (p1, p4, p8, p10);
  if n = 4 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K02 verkeerde panden'; end if;
  select count(*) into n from public.tasks where org_id = org_a and property_id in (p2, p3, p5, p6, p7, p9);
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K03 taak voor een pand dat geen taak hoort te krijgen'; end if;

  -- K04 deadline 14 dagen voor het einde (laatste mandaat telt), K05 nooit in het verleden
  select due_date into d from public.tasks where property_id = p8;
  if d = current_date + 11 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K04 deadline pand 8 klopt niet: ' || d; end if;
  select due_date into d from public.tasks where property_id = p1;
  if d = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K05 deadline pand 1 klopt niet: ' || d; end if;
  select due_date into d from public.tasks where property_id = p4;
  if d = current_date then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K06 deadline verlopen mandaat klopt niet'; end if;

  -- K07 titel, geen verantwoordelijke, gemaakt door de ingelogde gebruiker
  select title into t from public.tasks where property_id = p1;
  if t = 'Verleng mandaat: Pand 1 (' || (select reference from public.properties where id = p1) || ')' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K07 titel klopt niet: ' || t; end if;
  select count(*) into n from public.tasks where property_id = p1 and assigned_to is null and created_by = ua and status = 'open';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K08 verantwoordelijke of created_by klopt niet'; end if;

  -- K09 nog eens aanroepen maakt niets dubbel
  n := public.sync_mandate_tasks(org_a);
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K09 tweede keer maakte ' || n || ' taken'; end if;

  -- K10 afgesloten taken komen niet terug
  update public.tasks set status = 'done' where property_id = p1;
  update public.tasks set status = 'cancelled' where property_id = p4;
  n := public.sync_mandate_tasks(org_a);
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K10 afgesloten taak kwam terug'; end if;

  -- K11 nieuwe einddatum die weer snel afloopt: wel een nieuwe taak
  update public.property_mandates set valid_until = current_date + 12 where id = m1;
  n := public.sync_mandate_tasks(org_a);
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K11 nieuwe einddatum gaf ' || n || ' taken'; end if;

  -- K12 lege naam valt terug op de standaardtekst
  update public.property_mandates set valid_until = current_date + 4 where property_id = p10;
  perform public.sync_mandate_tasks(org_a, '   ');
  select count(*) into n from public.tasks where org_id = org_a and title like 'Renew mandate:%';
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K12 standaardtekst: ' || n; end if;

  -- K13 viewer mag het niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.sync_mandate_tasks(org_a);
    bad := bad + 1; fails := fails || E'\n - K13 viewer kon taken aanmaken';
  exception when others then ok := ok + 1;
  end;

  -- K14 eigenaar van een ander kantoor mag het niet voor kantoor A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.sync_mandate_tasks(org_a);
    bad := bad + 1; fails := fails || E'\n - K14 ander kantoor kon taken aanmaken';
  exception when others then ok := ok + 1;
  end;

  -- K15 kantoor B heeft niets te doen en krijgt geen taken van A
  n := public.sync_mandate_tasks(org_b);
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K15 kantoor B kreeg taken'; end if;
  select count(*) into n from public.tasks where org_id = org_b;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K16 kantoor B ziet taken'; end if;

  -- K17 anoniem mag de functie niet aanroepen
  reset role;
  set local role anon;
  begin
    perform public.sync_mandate_tasks(org_a);
    bad := bad + 1; fails := fails || E'\n - K17 anoniem kon de functie aanroepen';
  exception when others then ok := ok + 1;
  end;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
