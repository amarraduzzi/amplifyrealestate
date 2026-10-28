-- Test voor etappe 6e: aanvragen via de publieke pagina en bezoekcijfers.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000300_inquiries.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 9 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  org_a uuid; org_b uuid; prop_a uuid; prop_off uuid; ow uuid;
  n int; n2 int; st text; msg text; ok_b boolean; ref_a text; ref_off text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'iq-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'iq-b@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Inq Kantoor B', 'inq-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Inq Kantoor A', 'inq-kantoor-a', 'Rabat');
  insert into public.people (org_id, full_name) values (org_a, 'Eigenaar') returning id into ow;
  insert into public.properties (org_id, title, purpose, status, property_type, city, neighborhood)
    values (org_a, 'Villa Souissi', 'sale', 'available', 'villa', 'Rabat', 'Souissi') returning id into prop_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Niet online', 'rent_long', 'available') returning id into prop_off;
  insert into public.property_mandates (org_id, property_id, owner_person_id, basis) values (org_a, prop_a, ow, 'written');
  update public.properties set is_published = true where id = prop_a;
  reset role;
  select reference into ref_a from public.properties where id = prop_a;
  select reference into ref_off from public.properties where id = prop_off;

  -- Als anonieme bezoeker
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  -- I01 aanvraag voor een online pand: persoon, lead met bron en taak
  select public.submit_inquiry('inq-kantoor-a', ref_a, 'Sara Bouzidi', '06 61 23 45 67', 'Disponible samedi ?') into ok_b;
  reset role;
  select count(*) into n from public.leads l join public.people p on p.id = l.person_id
   where l.org_id = org_a and l.source = 'public_page' and l.purpose = 'sale' and 'villa' = any(l.property_types) and p.full_name = 'Sara Bouzidi';
  select count(*) into n2 from public.tasks where org_id = org_a and property_id = prop_a and title like 'Rappeler Sara Bouzidi%' and due_date = current_date;
  if ok_b and n = 1 and n2 = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I01 leads ' || n || ', taken ' || n2; end if;

  -- I02 nog eens binnen 10 minuten: niets dubbel
  set local role anon;
  perform public.submit_inquiry('inq-kantoor-a', null, 'Sara Bouzidi', '+212661234567', 'Encore moi');
  reset role;
  select count(*) into n from public.people where org_id = org_a and full_name = 'Sara Bouzidi';
  select count(*) into n2 from public.tasks where org_id = org_a and title like 'Rappeler Sara%';
  if n = 1 and n2 = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I02 personen ' || n || ', taken ' || n2; end if;

  -- I03 later: bestaande persoon en lopende lead krijgen de vraag erbij
  update public.leads set created_at = now() - interval '1 hour' where org_id = org_a;
  set local role anon;
  perform public.submit_inquiry('inq-kantoor-a', null, 'Sara B', '0661234567', 'Autre question', 'sale');
  reset role;
  select count(*), max(notes) into n, st from public.leads where org_id = org_a;
  if n = 1 and st like '%Autre question%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I03 leads ' || n; end if;

  -- I04 ongeldig nummer wordt geweigerd
  set local role anon;
  begin perform public.submit_inquiry('inq-kantoor-a', null, 'Iemand', '123', 'x'); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'inquiry_invalid' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I04 ' || coalesce(msg, 'geen fout'); end if;

  -- I05 robotveld ingevuld: geen lead
  perform public.submit_inquiry('inq-kantoor-a', null, 'Robot', '0612345678', 'spam', null, 'http://spam');
  reset role;
  select count(*) into n from public.people where org_id = org_a and full_name = 'Robot';
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I05 robot opgeslagen'; end if;

  -- I06 pand dat niet online staat: aanvraag komt binnen als kantoorvraag, zonder pand
  set local role anon;
  perform public.submit_inquiry('inq-kantoor-a', ref_off, 'Omar', '0677777777', null, 'rent_long');
  reset role;
  select count(*) into n from public.tasks where org_id = org_a and title like 'Rappeler Omar%' and property_id is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I06 ' || n; end if;

  -- I07 bezoeken tellen, alleen voor online panden
  set local role anon;
  perform public.log_page_event('inq-kantoor-a', ref_a, 'view');
  perform public.log_page_event('inq-kantoor-a', ref_a, 'view');
  perform public.log_page_event('inq-kantoor-a', ref_a, 'whatsapp');
  perform public.log_page_event('inq-kantoor-a', ref_off, 'view');
  perform public.log_page_event('inq-kantoor-a', null, 'view');
  reset role;
  select sum(views), sum(whatsapp) into n, n2 from public.page_stats where property_id = prop_a;
  if n = 2 and n2 = 1 and not exists (select 1 from public.page_stats where property_id = prop_off)
     and exists (select 1 from public.page_stats where org_id = org_a and property_id is null and views = 1) then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - I07 bezoeken ' || coalesce(n, 0) || ', whatsapp ' || coalesce(n2, 0); end if;

  -- I08 bezoeker leest geen tabellen
  set local role anon;
  begin select count(*) into n from public.page_stats; msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I08 anon las page_stats'; end if;

  -- I09 een ander kantoor ziet de cijfers en leads niet
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.page_stats where org_id = org_a;
  select n + count(*) into n from public.leads where org_id = org_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - I09 B ziet ' || n; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
