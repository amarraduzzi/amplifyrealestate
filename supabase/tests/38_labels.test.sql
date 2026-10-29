-- Test voor de labels Nouveau en Prix en baisse (20261103000200_labels.sql).
-- Plak in de Supabase SQL-editor en klik op Run. Eindigt altijd met een rode melding; alles wordt teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; pr uuid; ow uuid; r record; j jsonb;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'lb-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Label Kantoor', 'label-kantoor', 'Rabat');
  insert into public.people (org_id, full_name) values (org_a, 'Eigenaar') returning id into ow;
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents, previous_price_cents)
    values (org_a, 'Villa', 'sale', 'available', 'villa', 300000000, 999999999) returning id into pr;
  insert into public.property_mandates (org_id, property_id, owner_person_id, basis) values (org_a, pr, ow, 'written');
  update public.properties set is_published = true where id = pr;

  -- L01 bij aanmaken kan je geen oude prijs meegeven
  select * into r from public.properties where id = pr;
  if r.previous_price_cents is null and r.price_drop_at is null then ok := ok + 1; else bad := bad + 1; fails := fails || ' L01'; end if;

  -- L02 prijs omlaag: oude prijs bewaard
  update public.properties set price_cents = 280000000 where id = pr;
  select * into r from public.properties where id = pr;
  if r.previous_price_cents = 300000000 and r.price_drop_at is not null then ok := ok + 1; else bad := bad + 1; fails := fails || ' L02'; end if;

  -- L03 tweede verlaging: de hoogste prijs blijft staan
  update public.properties set price_cents = 260000000 where id = pr;
  select * into r from public.properties where id = pr;
  if r.previous_price_cents = 300000000 then ok := ok + 1; else bad := bad + 1; fails := fails || ' L03'; end if;

  -- L04 met de hand een oude prijs zetten werkt niet
  update public.properties set previous_price_cents = 900000000, title = 'Villa Souissi' where id = pr;
  select * into r from public.properties where id = pr;
  if r.previous_price_cents = 300000000 then ok := ok + 1; else bad := bad + 1; fails := fails || ' L04'; end if;
  reset role;

  -- L05 de publieke pagina geeft de oude prijs en de publicatiedatum mee
  set local role anon;
  j := public.public_office_page('label-kantoor');
  reset role;
  if (j->'listings'->0->>'old_price_cents')::bigint = 300000000 and j->'listings'->0->>'published_at' is not null
  then ok := ok + 1; else bad := bad + 1; fails := fails || ' L05'; end if;

  -- L06 prijs weer omhoog: label weg
  set local role authenticated;
  update public.properties set price_cents = 310000000 where id = pr;
  reset role;
  set local role anon;
  j := public.public_office_page('label-kantoor');
  reset role;
  if j->'listings'->0->'old_price_cents' = 'null'::jsonb then ok := ok + 1; else bad := bad + 1; fails := fails || ' L06'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt%', ok, bad, case when fails <> '' then ' (' || fails || ')' else '' end;
end $test$;
