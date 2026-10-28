-- Test voor etappe 6f: facturen en notes d'honoraires.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261028000400_invoices.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 11 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); uv uuid := gen_random_uuid();
  org_a uuid; org_b uuid; i1 uuid; i2 uuid; i3 uuid;
  n int; st text; msg text; v bigint; v2 bigint;
  ok int := 0; bad int := 0; fails text := '';
  lines jsonb := '[{"label": "Honoraires de négociation", "qty": 1, "unit_cents": 5000000}]';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'inv-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'inv-b@test.invalid', 'authenticated', 'authenticated'),
    (ug, 'inv-g@test.invalid', 'authenticated', 'authenticated'), (uv, 'inv-v@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Inv Kantoor B', 'inv-kantoor-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Inv Kantoor A', 'inv-kantoor-a');
  perform public.add_member(org_a, 'inv-g@test.invalid', 'agent');
  perform public.add_member(org_a, 'inv-v@test.invalid', 'viewer');

  -- F01 zonder factuurgegevens geen factuur
  begin perform public.create_invoice(org_a, null, 'facture', 'Client SARL', null, null, lines); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'billing_info_missing' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F01 ' || coalesce(msg, 'geen fout'); end if;

  -- F02 eigenaar vult de factuurgegevens in; een ongeldig ICE wordt geweigerd
  update public.organizations set legal_name = 'Inv Immobilier SARL', legal_form = 'company', ice = '001234567000089', if_number = '12345678', legal_address = 'Agdal, Rabat' where id = org_a;
  begin update public.organizations set ice = '123' where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  select ice into st from public.organizations where id = org_a;
  if st = '001234567000089' and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F02 ice ' || coalesce(st, '-'); end if;

  -- F03 factuur met 20% btw en het eerste nummer
  i1 := public.create_invoice(org_a, null, 'facture', 'Client SARL', 'Casablanca', '009876543000012', lines);
  select number, total_cents, vat_cents into st, v, v2 from public.invoices where id = i1;
  if st = 'F-' || extract(year from current_date) || '-0001' and v = 6000000 and v2 = 1000000 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - F03 ' || coalesce(st, '-') || ' totaal ' || coalesce(v::text, '-'); end if;

  -- F04 nummering loopt door (agent maakt een note d'honoraires)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  i2 := public.create_invoice(org_a, null, 'note_honoraires', 'Particulier', null, null, '[{"label": "Honoraires", "qty": 2, "unit_cents": 100000}]');
  select number, subtotal_cents into st, v from public.invoices where id = i2;
  if st like 'NH-%-0002' and v = 200000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F04 ' || coalesce(st, '-'); end if;

  -- F05 de inhoud staat vast: bedrag of klant wijzigen kan niet
  begin update public.invoices set total_cents = 1 where id = i1; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F05 bedrag gewijzigd'; end if;

  -- F06 een agent kan de status niet wijzigen
  update public.invoices set status = 'paid' where id = i1;
  select status::text into st from public.invoices where id = i1;
  if st = 'issued' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F06 agent zette status ' || st; end if;

  -- F07 eigenaar zet betaald (datum vanzelf) en annuleert een andere
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.invoices set status = 'paid', payment_method = 'transfer' where id = i1;
  update public.invoices set status = 'cancelled' where id = i2;
  select count(*) into n from public.invoices where (id = i1 and paid_on = current_date) or (id = i2 and cancelled_on = current_date);
  if n = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F07 ' || n; end if;

  -- F08 geannuleerd blijft geannuleerd, en het volgende nummer slaat niets over
  begin update public.invoices set status = 'issued' where id = i2; msg := null; exception when others then msg := sqlerrm; end;
  i3 := public.create_invoice(org_a, null, 'facture', 'Client 3', null, null, lines);
  select number into st from public.invoices where id = i3;
  if msg is not null and st like '%-0003' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F08 ' || coalesce(st, '-') || ' ' || coalesce(msg, 'geen fout'); end if;

  -- F09 auto-entrepreneur: geen btw
  update public.organizations set legal_form = 'auto_entrepreneur' where id = org_a;
  i3 := public.create_invoice(org_a, null, 'facture', 'Client 4', null, null, lines);
  select vat_cents, total_cents, seller->>'form' into v, v2, st from public.invoices where id = i3;
  if v = 0 and v2 = 5000000 and st = 'auto_entrepreneur' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F09 btw ' || v; end if;

  -- F10 een viewer en een ander kantoor zien de facturen niet
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.invoices where org_id = org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select n + count(*) into n from public.invoices where org_id = org_a;
  begin perform public.create_invoice(org_a, null, 'facture', 'X', null, null, lines); msg := null; exception when others then msg := sqlerrm; end;
  if n = 0 and msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F10 ziet ' || n; end if;

  -- F11 plan afgelopen: geen nieuwe facturen
  reset role;
  update public.organizations set plan_until = current_date - 1 where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_invoice(org_a, null, 'facture', 'X', null, null, lines); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'plan_expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F11 ' || coalesce(msg, 'geen fout'); end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
