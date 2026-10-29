-- Test voor de vertaalde teksten van de site (20261103000500_site_texts_tr.sql).
-- Plak in de Supabase SQL-editor en klik op Run. Eindigt altijd met een rode melding; alles wordt teruggedraaid.
--   "TESTRESULTAAT: 3 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; j jsonb; st text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'tr-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Taal Kantoor', 'taal-kantoor', 'Rabat');

  -- T01 de eigenaar kan vertalingen opslaan
  begin
    update public.organizations set site_about = 'Bonjour', site_texts_tr = '{"en": {"about": "Hello"}, "nl": {"about": "Hallo"}}' where id = org_a;
    st := 'ok';
  exception when others then st := sqlerrm; end;
  if st = 'ok' then ok := ok + 1; else bad := bad + 1; fails := fails || ' T01(' || st || ')'; end if;

  -- T02 een onbekende taal wordt geweigerd
  begin
    update public.organizations set site_texts_tr = '{"de": {"about": "Hallo"}}' where id = org_a;
    st := 'geen fout';
  exception when others then st := 'geweigerd'; end;
  reset role;
  if st = 'geweigerd' then ok := ok + 1; else bad := bad + 1; fails := fails || ' T02'; end if;

  -- T03 de publieke pagina geeft de vertalingen mee
  set local role anon;
  j := public.public_office_page('taal-kantoor');
  reset role;
  if j->'site'->'tr'->'en'->>'about' = 'Hello' and j->'site'->>'about' = 'Bonjour' then ok := ok + 1; else bad := bad + 1; fails := fails || ' T03'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt%', ok, bad, case when fails <> '' then ' (' || fails || ')' else '' end;
end $test$;
