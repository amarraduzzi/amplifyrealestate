-- Test voor etappe 2h: documenten bij een deal (rechten, limiet, plan, prive opslag).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261027001100_deal_documents.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 22 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  ug uuid := gen_random_uuid();  -- agent kantoor A
  um uuid := gen_random_uuid();  -- manager kantoor A
  org_a uuid; org_b uuid;
  person_a uuid; lead_a uuid; prop_a uuid; deal_a uuid;
  doc1 uuid;
  n int; i int; pad text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',   'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',   'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid',  'authenticated', 'authenticated'),
    (ug, 'a-agent@test.invalid',   'authenticated', 'authenticated'),
    (um, 'a-manager@test.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid',  'viewer');
  perform public.add_member(org_a, 'a-agent@test.invalid',   'agent');
  perform public.add_member(org_a, 'a-manager@test.invalid', 'manager');
  insert into public.people (org_id, full_name) values (org_a, 'Persoon A') returning id into person_a;
  insert into public.leads (org_id, person_id, purpose) values (org_a, person_a, 'sale') returning id into lead_a;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Pand A', 'sale', 'available') returning id into prop_a;
  insert into public.deals (org_id, lead_id, property_id, price_cents) values (org_a, lead_a, prop_a, 100000000) returning id into deal_a;

  -- X01 eigenaar voegt een document toe; created_by klopt
  insert into public.deal_documents (org_id, deal_id, kind, file_name, mime_type, size_bytes)
  values (org_a, deal_a, 'contract', 'koopcontract.pdf', 'application/pdf', 250000) returning id into doc1;
  select count(*) into n from public.deal_documents where id = doc1 and created_by = ua;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X01 document toevoegen mislukt'; end if;

  -- X02 ongeldige soort, X03 verkeerd bestandstype, X04 te groot, X05 lege naam
  begin insert into public.deal_documents (org_id, deal_id, kind, file_name, mime_type, size_bytes) values (org_a, deal_a, 'id_copy', 'x.pdf', 'application/pdf', 10);
    bad := bad + 1; fails := fails || E'\n - X02 soort id_copy toegestaan'; exception when others then ok := ok + 1; end;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'x.exe', 'application/x-msdownload', 10);
    bad := bad + 1; fails := fails || E'\n - X03 .exe toegestaan'; exception when others then ok := ok + 1; end;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'groot.pdf', 'application/pdf', 10485761);
    bad := bad + 1; fails := fails || E'\n - X04 bestand van meer dan 10 MB toegestaan'; exception when others then ok := ok + 1; end;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, '', 'application/pdf', 10);
    bad := bad + 1; fails := fails || E'\n - X05 lege bestandsnaam toegestaan'; exception when others then ok := ok + 1; end;

  -- X06 deal van een ander kantoor kan niet gekoppeld worden
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_b, deal_a, 'x.pdf', 'application/pdf', 10);
    bad := bad + 1; fails := fails || E'\n - X06 deal van ander kantoor gekoppeld'; exception when others then ok := ok + 1; end;

  -- X07 maximaal 20 documenten per deal
  for i in 2..20 loop
    insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'doc' || i || '.pdf', 'application/pdf', 1000);
  end loop;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'doc21.pdf', 'application/pdf', 1000);
    bad := bad + 1; fails := fails || E'\n - X07 21e document toegestaan'; exception when others then ok := ok + 1; end;

  -- Opslagpaden
  pad := org_a::text || '/' || deal_a::text || '/' || doc1::text;

  -- X08 agent: lezen en uploaden mag, verwijderen niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deal_documents;
  if n = 20 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X08 agent ziet ' || n || ' documenten'; end if;
  if public.storage_doc_read_ok(pad) and public.storage_doc_write_ok(pad) and not public.storage_doc_delete_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X09 opslagrechten van de agent kloppen niet'; end if;
  delete from public.deal_documents where id = doc1;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X10 agent kon een document verwijderen'; end if;

  -- X11 viewer ziet niets en kan niets
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deal_documents;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X11 viewer ziet ' || n || ' documenten'; end if;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'v.pdf', 'application/pdf', 10);
    bad := bad + 1; fails := fails || E'\n - X12 viewer kon een document toevoegen'; exception when others then ok := ok + 1; end;
  if not public.storage_doc_read_ok(pad) and not public.storage_doc_write_ok(pad) and not public.storage_doc_delete_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X13 viewer heeft opslagrechten'; end if;

  -- X14 ander kantoor ziet niets en heeft geen opslagrechten op dit pad
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deal_documents;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X14 ander kantoor ziet ' || n || ' documenten'; end if;
  if not public.storage_doc_read_ok(pad) and not public.storage_doc_write_ok(pad) and not public.storage_doc_delete_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X15 ander kantoor heeft opslagrechten'; end if;

  -- X16 een pad dat niet met een kantoor begint wordt geweigerd
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.storage_doc_read_ok('onzin/pad') and not public.storage_doc_write_ok('') then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X16 ongeldig pad toegestaan'; end if;

  -- X17 manager mag verwijderen
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', um, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.deal_documents where id = doc1;
  get diagnostics n = row_count;
  if n = 1 and public.storage_doc_delete_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X17 manager kon niet verwijderen'; end if;

  -- Plan afgelopen: lezen blijft, uploaden en verwijderen niet meer
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deal_documents;
  if n = 19 and public.storage_doc_read_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X18 lezen na afloop plan: ' || n; end if;
  begin insert into public.deal_documents (org_id, deal_id, file_name, mime_type, size_bytes) values (org_a, deal_a, 'laat.pdf', 'application/pdf', 10);
    bad := bad + 1; fails := fails || E'\n - X19 uploaden na afloop plan'; exception when others then ok := ok + 1; end;
  delete from public.deal_documents where deal_id = deal_a;
  get diagnostics n = row_count;
  if n = 0 and not public.storage_doc_write_ok(pad) and not public.storage_doc_delete_ok(pad) then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - X20 verwijderen of opslag na afloop plan'; end if;

  -- X21 anoniem heeft geen toegang
  reset role;
  set local role anon;
  begin perform count(*) from public.deal_documents;
    bad := bad + 1; fails := fails || E'\n - X21 anoniem kon documenten lezen'; exception when others then ok := ok + 1; end;
  begin perform public.storage_doc_read_ok(pad);
    bad := bad + 1; fails := fails || E'\n - X22 anoniem kon opslagfunctie aanroepen'; exception when others then ok := ok + 1; end;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
