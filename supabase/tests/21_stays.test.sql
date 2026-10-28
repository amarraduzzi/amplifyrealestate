-- Test voor etappe 7e: korte verhuur.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028001000_stays.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; ow uuid; pr uuid; pr_long uuid; s1 uuid; c uuid; st uuid; tok text; j jsonb;
  msg text; n int; v bigint;
  m0 date := date_trunc('month', current_date)::date;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'st-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Sejour Kantoor', 'sejour-kantoor');
  insert into public.people (org_id, full_name) values (org_a, 'Eigenaar') returning id into ow;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Maison de plage', 'rent_short', 'available') returning id into pr;
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Appartement', 'rent_long', 'available') returning id into pr_long;
  insert into public.property_parties (org_id, property_id, person_id, role) values (org_a, pr, ow, 'owner');

  -- K01 boeking maakt de taken Accueil en Ménage
  insert into public.stays (org_id, property_id, guest_name, channel, check_in, check_out, total_cents, channel_fee_cents)
    values (org_a, pr, 'Famille Dupont', 'airbnb', m0 + 1, m0 + 4, 900000, 135000) returning id into s1;
  select count(*) into n from public.tasks where property_id = pr and status = 'open' and auto_key like 'stay:%';
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K01 taken ' || n; end if;

  -- K02 overlap kan niet; aansluitend (vertrekdag = aankomstdag) wel
  begin insert into public.stays (org_id, property_id, guest_name, check_in, check_out) values (org_a, pr, 'Overlap', m0 + 3, m0 + 6); msg := null; exception when others then msg := sqlerrm; end;
  insert into public.stays (org_id, property_id, guest_name, check_in, check_out, total_cents) values (org_a, pr, 'Ali', m0 + 4, m0 + 6, 400000);
  if msg like '%stay_overlap%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K02 ' || coalesce(msg, 'geen fout'); end if;

  -- K03 alleen voor korte verhuur
  begin insert into public.stays (org_id, property_id, guest_name, check_in, check_out) values (org_a, pr_long, 'X', m0 + 1, m0 + 2); msg := null; exception when others then msg := sqlerrm; end;
  if msg like '%stay_not_short_term%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K03 ' || coalesce(msg, 'geen fout'); end if;

  -- K04 data wijzigen schuift de taken mee
  update public.stays set check_out = m0 + 3 where id = s1;
  select due_date into msg from public.tasks where auto_key = 'stay:' || s1 || ':out';
  if msg::date = m0 + 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K04 ' || msg; end if;

  -- K05 annuleren annuleert de taken
  update public.stays set status = 'cancelled' where id = s1;
  select count(*) into n from public.tasks where auto_key like 'stay:' || s1 || ':%' and status = 'cancelled';
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K05 ' || n; end if;
  update public.stays set status = 'confirmed' where id = s1;

  -- K06 iCal: alleen bezette data, geen namen of bedragen
  tok := public.renew_ical_token(pr);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  j := public.public_ical(tok);
  reset role;
  if jsonb_array_length(j->'busy') = 2 and position('Dupont' in j::text) = 0 and position('900000' in j::text) = 0 and public.public_ical(repeat('0', 64)) is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - K06 ' || coalesce(j::text, 'null'); end if;

  -- K07 maandafrekening telt boekingen met vertrek in de maand mee (netto na commissie kanaal)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.management_contracts (org_id, property_id, owner_person_id, fee_pct) values (org_a, pr, ow, 20) returning id into c;
  st := public.make_statement(c, current_date);
  select rent_cents into v from public.owner_statements where id = st;
  -- 9000 - 1350 = 7650 en 4000 = 11650 DH, als beide vertrekdata in deze maand vallen
  if v = 1165000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K07 opbrengst ' || v; end if;

  -- K08 de boekingen staan in de details van de afrekening
  select jsonb_array_length(details->'stays') into n from public.owner_statements where id = st;
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - K08 ' || n; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
