-- Test voor etappe 9a/9b: syndic (residenties, kavels, appels de fonds).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028001100_syndic.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; res uuid; empty_res uuid; p1 uuid; c1 uuid; c2 uuid; it uuid;
  n bigint; m bigint; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'sy-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'sy-b@test.invalid', 'authenticated', 'authenticated'),
    (uv, 'sy-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Syndic B', 'syndic-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Syndic A', 'syndic-kantoor-a');
  perform public.add_member(org_a, 'sy-v@test.invalid', 'viewer');
  insert into public.people (org_id, full_name) values (org_a, 'Copropriétaire 1') returning id into p1;
  insert into public.residences (org_id, name, city) values (org_a, 'Résidence Al Andalous', 'Rabat') returning id into res;
  insert into public.residences (org_id, name) values (org_a, 'Lege residentie') returning id into empty_res;
  insert into public.residence_lots (org_id, residence_id, label, tantiemes, owner_person_id) values
    (org_a, res, 'A1', 333, p1), (org_a, res, 'A2', 333, null), (org_a, res, 'A3', 334, null);

  -- S01 verdeling naar tantièmes telt precies op tot het totaal (1000,00 DH)
  c1 := public.issue_charge_call(res, 'Charges T1', current_date + 15, 100000);
  select sum(amount_cents), max(amount_cents) - min(amount_cents) into n, m from public.charge_items where call_id = c1;
  if n = 100000 and m <= 200 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S01 som ' || n || ', verschil ' || m; end if;

  -- S02 gelijke verdeling van een oneven bedrag telt ook precies op
  c2 := public.issue_charge_call(res, 'Travaux', current_date + 30, 100001, 'equal');
  select sum(amount_cents) into n from public.charge_items where call_id = c2;
  if n = 100001 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S02 som ' || n; end if;

  -- S03 geen appel de fonds zonder kavels
  begin perform public.issue_charge_call(empty_res, 'X', current_date, 1000); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'charge_call_no_lots' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S03 ' || coalesce(msg, 'geen fout'); end if;

  -- S04 betaling vastleggen zet de datum; het bedrag per kavel staat vast
  select id into it from public.charge_items where call_id = c1 order by amount_cents desc limit 1;
  update public.charge_items set paid_cents = amount_cents where id = it;
  begin update public.charge_items set amount_cents = 1 where id = it; msg := null; exception when others then msg := sqlerrm; end;
  if (select paid_on from public.charge_items where id = it) = current_date and msg is not null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S04 ' || coalesce(msg, 'geen fout'); end if;

  -- S05 meer betalen dan het bedrag kan niet
  begin update public.charge_items set paid_cents = amount_cents + 1 where id = it; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S05 te veel betaald toegestaan'; end if;

  -- S06 annuleren kan niet als er al betaald is; wel als er niets betaald is
  begin perform public.cancel_charge_call(c1); msg := null; exception when others then msg := sqlerrm; end;
  perform public.cancel_charge_call(c2);
  if msg = 'charge_call_has_payments' and (select status::text from public.charge_calls where id = c2) = 'cancelled' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S06 ' || coalesce(msg, 'geen fout'); end if;

  -- S07 een viewer ziet residenties maar geen appels de fonds
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.residences where org_id = org_a;
  select count(*) into m from public.charge_items where org_id = org_a;
  if n = 2 and m = 0 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S07 residenties ' || n || ', regels ' || m; end if;

  -- S08 een ander kantoor ziet niets en kan geen appel de fonds maken
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.residences where org_id = org_a;
  begin perform public.issue_charge_call(res, 'X', current_date, 1000); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S08 ziet ' || n; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
