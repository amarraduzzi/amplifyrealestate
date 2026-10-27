-- Test voor leads (etappe 1b-4).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run.
-- Het script eindigt ALTIJD met een melding in rood. Dat is bedoeld: de melding bevat het resultaat en
-- zorgt ervoor dat alle testgegevens automatisch worden teruggedraaid.
--   "TESTRESULTAAT: 13 geslaagd, 0 mislukt"  = alles in orde
--
-- Voer dit alleen uit op een project dat de migraties 20261027000100_core.sql en 20261027000200_leads.sql heeft.

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  ug uuid := gen_random_uuid();  -- agent kantoor A
  org_a uuid; org_b uuid;
  person_a uuid; person_b uuid; lead_a uuid;
  n int;
  t_old timestamptz;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',  'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',  'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid', 'authenticated', 'authenticated'),
    (ug, 'a-agent@test.invalid',  'authenticated', 'authenticated');

  -- Kantoor B (met een eigen persoon)
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Casablanca');
  insert into public.people (org_id, full_name) values (org_b, 'Persoon B') returning id into person_b;

  -- Kantoor A: eigenaar maakt kantoor, voegt viewer en agent toe
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  perform public.add_member(org_a, 'a-viewer@test.invalid', 'viewer');
  perform public.add_member(org_a, 'a-agent@test.invalid',  'agent');
  insert into public.people (org_id, full_name) values (org_a, 'Persoon A') returning id into person_a;

  -- T01 eigenaar kan een lead aanmaken, met zoekcriteria
  insert into public.leads (org_id, person_id, purpose, property_types, city, neighborhoods, budget_min_cents, budget_max_cents, min_bedrooms, furnished)
  values (org_a, person_a, 'rent_long', array['apartment','house']::public.property_type[], 'Rabat', array['Agdal','Hay Riad'], 300000, 600000, 2, true)
  returning id into lead_a;
  select count(*) into n from public.leads where id = lead_a and status = 'new' and array_length(property_types, 1) = 2;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T01 lead aanmaken mislukt'; end if;

  -- T02 created_by is de ingelogde gebruiker
  select count(*) into n from public.leads where id = lead_a and created_by = ua;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T02 created_by klopt niet'; end if;

  -- T03 maximum onder minimum wordt geweigerd
  begin
    insert into public.leads (org_id, person_id, purpose, budget_min_cents, budget_max_cents)
    values (org_a, person_a, 'sale', 500000, 100000);
    bad := bad + 1; fails := fails || E'\n - T03 budget max < min geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  -- T04 negatief budget wordt geweigerd
  begin
    insert into public.leads (org_id, person_id, purpose, budget_max_cents) values (org_a, person_a, 'sale', -5);
    bad := bad + 1; fails := fails || E'\n - T04 negatief budget geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  -- T05 persoon van een ander kantoor kan niet aan een lead gekoppeld worden
  begin
    insert into public.leads (org_id, person_id, purpose) values (org_a, person_b, 'sale');
    bad := bad + 1; fails := fails || E'\n - T05 persoon van ander kantoor gekoppeld';
  exception when others then ok := ok + 1;
  end;

  -- T06 status wijzigen en contact bijwerken
  update public.leads set status = 'viewing' where id = lead_a;
  select last_contact_at into t_old from public.leads where id = lead_a;
  perform public.touch_lead_contact(lead_a);
  select count(*) into n from public.leads where id = lead_a and status = 'viewing' and last_contact_at > t_old;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T06 status of contactmoment niet bijgewerkt'; end if;

  -- T07 lead verwijderen kan niet
  begin
    delete from public.leads where id = lead_a;
    bad := bad + 1; fails := fails || E'\n - T07 lead kon verwijderd worden';
  exception when others then ok := ok + 1;
  end;

  -- T08 lead kan niet naar een ander kantoor verhuisd worden
  begin
    update public.leads set org_id = org_b where id = lead_a;
    bad := bad + 1; fails := fails || E'\n - T08 org_id van lead kon gewijzigd worden';
  exception when others then ok := ok + 1;
  end;

  -- Viewer van kantoor A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T09 viewer ziet de lead
  select count(*) into n from public.leads where id = lead_a;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T09 viewer ziet lead niet'; end if;

  -- T10 viewer kan geen lead aanmaken of wijzigen
  begin
    insert into public.leads (org_id, person_id, purpose) values (org_a, person_a, 'sale');
    bad := bad + 1; fails := fails || E'\n - T10 viewer kon lead aanmaken';
  exception when others then ok := ok + 1;
  end;
  update public.leads set status = 'lost' where id = lead_a;
  select count(*) into n from public.leads where id = lead_a and status = 'lost';
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T10b viewer kon lead wijzigen'; end if;

  -- Eigenaar van kantoor B
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T11 ander kantoor ziet de lead niet
  select count(*) into n from public.leads where id = lead_a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T11 lead zichtbaar voor ander kantoor'; end if;

  -- Anonieme bezoeker
  reset role;
  set local role anon;

  -- T12 anonieme bezoeker heeft geen toegang
  begin
    perform count(*) from public.leads;
    bad := bad + 1; fails := fails || E'\n - T12 anoniem kon leads lezen';
  exception when others then ok := ok + 1;
  end;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
