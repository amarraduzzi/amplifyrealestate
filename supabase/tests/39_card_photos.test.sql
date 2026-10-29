-- Test voor de foto's op de pandkaartjes (20261103000300_card_photos.sql).
-- Plak in de Supabase SQL-editor en klik op Run. Eindigt altijd met een rode melding; alles wordt teruggedraaid.
--   "TESTRESULTAAT: 3 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; pr uuid; ow uuid; j jsonb; c uuid; i int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'cp-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Foto Kantoor', 'foto-kantoor', 'Rabat');
  insert into public.people (org_id, full_name) values (org_a, 'Eigenaar') returning id into ow;
  insert into public.properties (org_id, title, purpose, status, property_type) values (org_a, 'Villa', 'sale', 'available', 'villa') returning id into pr;
  insert into public.property_mandates (org_id, property_id, owner_person_id, basis) values (org_a, pr, ow, 'written');
  update public.properties set is_published = true where id = pr;
  for i in 1..7 loop
    insert into public.property_photos (org_id, property_id, created_at) values (org_a, pr, now() + (i || ' seconds')::interval);
  end loop;
  select id into c from public.property_photos where property_id = pr order by created_at desc limit 1;
  perform public.set_property_cover(c);
  reset role;

  set local role anon;
  j := public.public_office_page('foto-kantoor');
  reset role;

  -- P01 hoogstens 5 foto's
  if jsonb_array_length(j->'listings'->0->'photos') = 5 then ok := ok + 1; else bad := bad + 1; fails := fails || ' P01'; end if;
  -- P02 de omslag staat eerst en is gelijk aan cover
  if j->'listings'->0->'photos'->>0 = j->'listings'->0->>'cover' and j->'listings'->0->>'cover' like '%' || c::text
  then ok := ok + 1; else bad := bad + 1; fails := fails || ' P02'; end if;
  -- P03 de labels uit de vorige stap zijn er nog
  if (j->'listings'->0) ? 'published_at' and (j->'listings'->0) ? 'old_price_cents' then ok := ok + 1; else bad := bad + 1; fails := fails || ' P03'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt%', ok, bad, case when fails <> '' then ' (' || fails || ')' else '' end;
end $test$;
