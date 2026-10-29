-- Test voor de WhatsApp-alertes van de site (20261103000100_alerts.sql).
-- Plak in de Supabase SQL-editor en klik op Run. Eindigt altijd met een rode melding; alles wordt teruggedraaid.
--   "TESTRESULTAAT: 7 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid();
  org_a uuid; ok_b boolean; st text; n int; r record;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'al-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Alerte Kantoor', 'alerte-kantoor', 'Rabat');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  -- A01 alerte met criteria: lead met vlag, taal en bedragen in centimes
  select public.submit_alert('alerte-kantoor', 'Karim Idrissi', '+212 661 22 33 44', 'sale', 'villa', 'Hay Riad',
                             '2000000', '5000000', '3', '200', 'ar') into ok_b;
  reset role;
  select * into r from public.leads where org_id = org_a and wants_alerts;
  if ok_b and r.id is not null and r.alert_lang = 'ar' and r.budget_min_cents = 200000000 and r.budget_max_cents = 500000000
     and r.min_bedrooms = 3 and r.min_area_m2 = 200 and r.property_types = array['villa']::public.property_type[]
     and r.neighborhoods = array['Hay Riad'] and r.source = 'public_page' and r.purpose = 'sale'
  then ok := ok + 1; else bad := bad + 1; fails := fails || ' A01'; end if;

  -- A02 er is een taak om de bezoeker welkom te heten
  select count(*) into n from public.tasks where org_id = org_a and lead_id = r.id;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || ' A02'; end if;

  -- A03 twee keer verzenden maakt geen tweede alerte
  set local role anon;
  perform public.submit_alert('alerte-kantoor', 'Karim Idrissi', '0661223344', 'sale');
  reset role;
  select count(*) into n from public.leads where org_id = org_a and wants_alerts;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || ' A03'; end if;

  -- A04 zonder geldig doel: geweigerd
  set local role anon;
  begin
    perform public.submit_alert('alerte-kantoor', 'Sara', '0661000000', 'kopen');
    st := 'geen fout';
  exception when others then st := sqlerrm; end;
  reset role;
  if st = 'alert_invalid' then ok := ok + 1; else bad := bad + 1; fails := fails || ' A04'; end if;

  -- A05 onzin in de bedragen wordt genegeerd, geen fout
  set local role anon;
  select public.submit_alert('alerte-kantoor', 'Sara Alaoui', '0662000000', 'rent_long', null, null, 'abc', '-5', 'x', '') into ok_b;
  reset role;
  select * into r from public.leads l where org_id = org_a and wants_alerts and purpose = 'rent_long';
  if ok_b and r.budget_min_cents is null and r.budget_max_cents is null and r.min_bedrooms is null and r.alert_lang = 'fr'
  then ok := ok + 1; else bad := bad + 1; fails := fails || ' A05'; end if;

  -- A06 robotveld ingevuld: doet alsof het lukt, bewaart niets
  set local role anon;
  select public.submit_alert('alerte-kantoor', 'Robot', '0663000000', 'sale', p_trap => 'x') into ok_b;
  reset role;
  select count(*) into n from public.people where org_id = org_a and full_name = 'Robot';
  if ok_b and n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || ' A06'; end if;

  -- A07 anoniem kan de leads niet lezen
  set local role anon;
  begin
    select count(*) into n from public.leads;
    st := 'gelezen';
  exception when others then st := 'geweigerd'; end;
  reset role;
  if st = 'geweigerd' or n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || ' A07'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt%', ok, bad, case when fails <> '' then ' (' || fails || ')' else '' end;
end $test$;
