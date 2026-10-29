-- Test voor het blok Coup de cœur (20261103000400_featured.sql).
-- Plak in de Supabase SQL-editor en klik op Run. Eindigt altijd met een rode melding; alles wordt teruggedraaid.
--   "TESTRESULTAAT: 4 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; pr uuid; ow uuid; ref text; j jsonb; st text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'ft-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Coeur Kantoor', 'coeur-kantoor', 'Rabat');
  insert into public.people (org_id, full_name) values (org_a, 'Eigenaar') returning id into ow;
  insert into public.properties (org_id, title, purpose, status, property_type, description)
    values (org_a, 'Riad', 'sale', 'available', 'riad', 'Un riad   magnifique
avec patio.') returning id into pr;
  insert into public.property_mandates (org_id, property_id, owner_person_id, basis) values (org_a, pr, ow, 'written');
  update public.properties set is_published = true where id = pr;
  select reference into ref from public.properties where id = pr;

  -- F01 de eigenaar kan het pand uitlichten en het blok aanzetten
  begin
    update public.organizations set site_featured = ref, site_blocks = array['hero', 'featured', 'listings'] where id = org_a;
    st := 'ok';
  exception when others then st := sqlerrm; end;
  reset role;
  if st = 'ok' then ok := ok + 1; else bad := bad + 1; fails := fails || ' F01(' || st || ')'; end if;

  -- F02 de publieke pagina geeft het pand mee met een nette korte tekst
  set local role anon;
  j := public.public_office_page('coeur-kantoor');
  reset role;
  if j->'site'->'featured'->>'reference' = ref and j->'site'->'featured'->>'excerpt' = 'Un riad magnifique avec patio.'
  then ok := ok + 1; else bad := bad + 1; fails := fails || ' F02'; end if;

  -- F03 offline gehaald: niet meer uitgelicht
  set local role authenticated;
  update public.properties set is_published = false where id = pr;
  reset role;
  set local role anon;
  j := public.public_office_page('coeur-kantoor');
  reset role;
  if j->'site'->'featured' = 'null'::jsonb then ok := ok + 1; else bad := bad + 1; fails := fails || ' F03'; end if;

  -- F04 een onbekend blok blijft geweigerd
  set local role authenticated;
  begin
    update public.organizations set site_blocks = array['hero', 'iets'] where id = org_a;
    st := 'geen fout';
  exception when others then st := 'geweigerd'; end;
  reset role;
  if st = 'geweigerd' then ok := ok + 1; else bad := bad + 1; fails := fails || ' F04'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt%', ok, bad, case when fails <> '' then ' (' || fails || ')' else '' end;
end $test$;
