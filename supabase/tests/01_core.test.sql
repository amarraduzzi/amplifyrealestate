-- Test voor de databasekern (etappe 1a).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run.
-- Het script draait alle tests en eindigt ALTIJD met een melding in rood. Dat is bedoeld:
-- de melding bevat het resultaat en zorgt ervoor dat alle testgegevens automatisch worden teruggedraaid.
--   "TESTRESULTAAT: 27 geslaagd, 0 mislukt"  = alles in orde
--   Bij mislukte tests staat erachter welke.
--
-- Voer dit alleen uit op een project dat de migratie 20261027000100_core.sql al heeft.

do $test$
declare
  ua uuid := gen_random_uuid();  -- eigenaar kantoor A
  ub uuid := gen_random_uuid();  -- eigenaar kantoor B
  uv uuid := gen_random_uuid();  -- viewer kantoor A
  ug uuid := gen_random_uuid();  -- agent kantoor A
  um uuid := gen_random_uuid();  -- manager kantoor A
  org_a uuid; org_b uuid;
  prop_a uuid; person_a uuid; person_b uuid; mandate_a uuid;
  n int; n2 int;
  ok int := 0; bad int := 0; fails text := '';
  t_old timestamptz;
begin
  -- Voorbereiding (als beheerder): vijf testgebruikers
  insert into auth.users (id, email, aud, role) values
    (ua, 'a-owner@test.invalid',   'authenticated', 'authenticated'),
    (ub, 'b-owner@test.invalid',   'authenticated', 'authenticated'),
    (uv, 'a-viewer@test.invalid',  'authenticated', 'authenticated'),
    (ug, 'a-agent@test.invalid',   'authenticated', 'authenticated'),
    (um, 'a-manager@test.invalid', 'authenticated', 'authenticated');

  ---------------------------------------------------------------------------
  -- Als eigenaar van kantoor A
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  org_a := public.create_organization('Test Kantoor A', 'test-kantoor-a', 'Rabat');
  select count(*) into n from public.memberships where org_id = org_a and user_id = ua and role = 'owner';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T01 maker wordt eigenaar'; end if;

  -- T02 ongeldige slug wordt geweigerd
  begin
    perform public.create_organization('Fout Kantoor', 'Ongeldige Slug!', null);
    bad := bad + 1; fails := fails || E'\n - T02 ongeldige slug werd geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  -- T03 dubbele slug wordt geweigerd
  begin
    perform public.create_organization('Nog een A', 'test-kantoor-a', null);
    bad := bad + 1; fails := fails || E'\n - T03 dubbele slug werd geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  perform public.add_member(org_a, 'a-viewer@test.invalid',  'viewer');
  perform public.add_member(org_a, 'a-agent@test.invalid',   'agent');
  perform public.add_member(org_a, 'a-manager@test.invalid', 'manager');

  insert into public.people (org_id, full_name, phone, created_by)
  values (org_a, 'Eigenaar Test', '+212600000000', ub)
  returning id into person_a;

  -- T04 created_by kan niet vervalst worden
  select count(*) into n from public.people where id = person_a and created_by = ua;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T04 created_by is vervalst'; end if;

  insert into public.properties (org_id, title, purpose, status, price_cents)
  values (org_a, 'Appartement Agdal', 'rent_long', 'draft', 550000)
  returning id into prop_a;

  -- T05 aanmaken staat in de geschiedenis
  select count(*) into n from public.property_status_history where property_id = prop_a and field = 'created';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T05 geen created-regel in geschiedenis'; end if;

  update public.properties set status = 'available', price_cents = 500000 where id = prop_a;

  -- T06 statuswijziging gelogd met oude en nieuwe waarde
  select count(*) into n from public.property_status_history
   where property_id = prop_a and field = 'status' and old_value = 'draft' and new_value = 'available';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T06 statuswijziging niet gelogd'; end if;

  -- T07 prijswijziging gelogd
  select count(*) into n from public.property_status_history
   where property_id = prop_a and field = 'price_cents' and old_value = '550000' and new_value = '500000';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T07 prijswijziging niet gelogd'; end if;

  -- T08 bevestigen van informatie wordt gelogd
  select info_confirmed_at into t_old from public.properties where id = prop_a;
  perform public.confirm_property_info(prop_a);
  select count(*) into n from public.properties where id = prop_a and info_confirmed_at > t_old;
  select count(*) into n2 from public.property_status_history where property_id = prop_a and field = 'info_confirmed_at';
  if n = 1 and n2 = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T08 bevestiging niet bijgewerkt of niet gelogd'; end if;

  -- T09 negatieve prijs wordt geweigerd
  begin
    update public.properties set price_cents = -1 where id = prop_a;
    bad := bad + 1; fails := fails || E'\n - T09 negatieve prijs geaccepteerd';
  exception when others then ok := ok + 1;
  end;

  -- T10 pand verwijderen kan niet
  begin
    delete from public.properties where id = prop_a;
    bad := bad + 1; fails := fails || E'\n - T10 pand kon verwijderd worden';
  exception when others then ok := ok + 1;
  end;

  -- T11 betrokkene koppelen aan eigen pand lukt
  insert into public.property_parties (org_id, property_id, person_id, role)
  values (org_a, prop_a, person_a, 'owner');
  select count(*) into n from public.property_parties where property_id = prop_a;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T11 betrokkene koppelen mislukt'; end if;

  -- T12 mandaat aanmaken en intrekken (revoked_at wordt automatisch gezet)
  insert into public.property_mandates (org_id, property_id, owner_person_id, basis, evidence_note)
  values (org_a, prop_a, person_a, 'verbal', 'telefonisch afgesproken')
  returning id into mandate_a;
  update public.property_mandates set status = 'revoked' where id = mandate_a;
  select count(*) into n from public.property_mandates
   where id = mandate_a and status = 'revoked' and revoked_at is not null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T12 mandaat intrekken'; end if;

  -- T13 laatste eigenaar kan zichzelf niet degraderen
  begin
    perform public.add_member(org_a, 'a-owner@test.invalid', 'viewer');
    bad := bad + 1; fails := fails || E'\n - T13 laatste eigenaar gedegradeerd';
  exception when others then ok := ok + 1;
  end;

  -- T14 onbekende gebruiker toevoegen geeft een fout
  begin
    perform public.add_member(org_a, 'bestaat-niet@test.invalid', 'agent');
    bad := bad + 1; fails := fails || E'\n - T14 onbekende gebruiker toegevoegd';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------------------
  -- Als eigenaar van kantoor B (ander kantoor)
  ---------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;

  org_b := public.create_organization('Test Kantoor B', 'test-kantoor-b', 'Sale');
  insert into public.people (org_id, full_name) values (org_b, 'Eigenaar van B') returning id into person_b;

  -- T15 kantoor B ziet niets van kantoor A, in geen enkele tabel
  select
    (select count(*) from public.people where org_id = org_a)
  + (select count(*) from public.properties where org_id = org_a)
  + (select count(*) from public.property_parties where org_id = org_a)
  + (select count(*) from public.property_mandates where org_id = org_a)
  + (select count(*) from public.property_status_history where org_id = org_a)
  + (select count(*) from public.memberships where org_id = org_a)
  + (select count(*) from public.organizations where id = org_a)
  into n;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T15 kantoor B ziet gegevens van kantoor A (' || n || ' rijen)'; end if;

  -- T16 kantoor B kan geen pand in kantoor A aanmaken
  begin
    insert into public.properties (org_id, title, purpose) values (org_a, 'Indringer', 'sale');
    bad := bad + 1; fails := fails || E'\n - T16 B kon pand in A aanmaken';
  exception when others then ok := ok + 1;
  end;

  -- T17 kantoor B kan een pand van A niet wijzigen
  update public.properties set title = 'Gehackt' where id = prop_a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T17 B wijzigde pand van A'; end if;

  -- T18 kantoor B kan zichzelf niet toevoegen aan kantoor A
  begin
    perform public.add_member(org_a, 'b-owner@test.invalid', 'owner');
    bad := bad + 1; fails := fails || E'\n - T18 B voegde zichzelf toe aan A';
  exception when others then ok := ok + 1;
  end;

  -- T19 een rij van A kan niet naar een persoon van B verwijzen (als A)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.property_parties (org_id, property_id, person_id, role)
    values (org_a, prop_a, person_b, 'buyer');
    bad := bad + 1; fails := fails || E'\n - T19 koppeling over kantoorgrens heen gelukt';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------------------
  -- Als viewer van kantoor A
  ---------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T20 viewer kan lezen
  select count(*) into n from public.properties where org_id = org_a;
  if n >= 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T20 viewer kan niet lezen'; end if;

  -- T21 viewer kan niets aanmaken
  begin
    insert into public.properties (org_id, title, purpose) values (org_a, 'Viewer pand', 'sale');
    bad := bad + 1; fails := fails || E'\n - T21 viewer kon pand aanmaken';
  exception when others then ok := ok + 1;
  end;

  -- T22 viewer kan niets wijzigen
  update public.properties set title = 'Viewer wijziging' where id = prop_a;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T22 viewer wijzigde pand'; end if;

  ---------------------------------------------------------------------------
  -- Als agent van kantoor A
  ---------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T23 agent kan wel panden aanmaken
  insert into public.properties (org_id, title, purpose) values (org_a, 'Pand van agent', 'sale');
  select count(*) into n from public.properties where org_id = org_a and title = 'Pand van agent';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - T23 agent kon geen pand aanmaken'; end if;

  -- T24 agent kan geen leden toevoegen
  begin
    perform public.add_member(org_a, 'b-owner@test.invalid', 'viewer');
    bad := bad + 1; fails := fails || E'\n - T24 agent voegde lid toe';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------------------
  -- Als manager van kantoor A
  ---------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', um, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T25 manager kan geen eigenaar toevoegen of eigenaar wijzigen
  begin
    perform public.add_member(org_a, 'a-viewer@test.invalid', 'owner');
    bad := bad + 1; fails := fails || E'\n - T25a manager maakte eigenaar aan';
  exception when others then ok := ok + 1;
  end;
  begin
    perform public.add_member(org_a, 'a-owner@test.invalid', 'viewer');
    bad := bad + 1; fails := fails || E'\n - T25b manager wijzigde eigenaar';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------------------
  -- Anonieme bezoeker
  ---------------------------------------------------------------------------
  reset role;
  set local role anon;

  -- T26 anonieme bezoeker heeft geen toegang tot de tabellen
  begin
    perform count(*) from public.properties;
    bad := bad + 1; fails := fails || E'\n - T26 anoniem kon panden lezen';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------------------
  -- Als beheerder: de geschiedenis en org_id zijn zelfs voor de beheerder beschermd
  ---------------------------------------------------------------------------
  reset role;

  -- T27 geschiedenis kan niet gewijzigd worden
  begin
    update public.property_status_history set new_value = 'x' where property_id = prop_a;
    bad := bad + 1; fails := fails || E'\n - T27a geschiedenis kon gewijzigd worden';
  exception when others then ok := ok + 1;
  end;

  -- T28 geschiedenis kan niet gewist worden
  begin
    delete from public.property_status_history where property_id = prop_a;
    bad := bad + 1; fails := fails || E'\n - T28 geschiedenis kon gewist worden';
  exception when others then ok := ok + 1;
  end;

  -- T29 geschiedenis kan niet geleegd worden
  begin
    truncate public.property_status_history;
    bad := bad + 1; fails := fails || E'\n - T29 geschiedenis kon geleegd worden';
  exception when others then ok := ok + 1;
  end;

  -- T30 pand kan niet naar een ander kantoor verhuisd worden
  begin
    update public.properties set org_id = org_b where id = prop_a;
    bad := bad + 1; fails := fails || E'\n - T30 org_id van pand kon gewijzigd worden';
  exception when others then ok := ok + 1;
  end;

  -- Alles terugdraaien en het resultaat tonen
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
