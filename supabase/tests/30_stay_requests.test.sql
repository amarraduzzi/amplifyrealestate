-- Test voor etappe 12c: de aanvraaglink voor korte verhuur.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261030000200_stay_requests.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  org_a uuid; prop uuid; tok text; tok2 text; rid uuid; d jsonb; n bigint; msg text;
  d1 date := current_date + 14 + ((5 - extract(isodow from current_date + 14)::int + 7) % 7);  -- een vrijdag
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'sr-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'sr-b@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_organization('Aanvraag B', 'aanvraag-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Aanvraag A', 'aanvraag-a');
  insert into public.properties (org_id, title, purpose, status, price_cents, reference) values (org_a, 'Studio plage', 'rent_short', 'available', 50000, 'S-1') returning id into prop;
  insert into public.property_mandates (org_id, property_id, status, valid_until) values (org_a, prop, 'active', current_date + 365);
  update public.properties set is_published = true where id = prop;
  insert into public.stay_rates (property_id, org_id, weekend_price_cents, cleaning_cents, deposit_cents, advance_pct, min_nights, max_guests, min_offer_pct, payment_info)
    values (prop, org_a, 70000, 15000, 100000, 30, 2, 4, 80, 'RIB 011 810 ...');
  reset role;

  -- R01 de prijs: vrijdag en zaterdag tegen weekendprijs, zondag gewoon, plus schoonmaak: 700+700+500+150 = 2050 DH
  set local role anon;
  tok := public.submit_stay_request('aanvraag-a', 'S-1', 'Nadia Benali', '0612345678', 2, d1, d1 + 3, '16:00', 'Bonjour', null, true, 'fr');
  d := public.public_stay_request(tok);
  if (d->'request'->>'total_cents')::bigint = 205000 and (d->'request'->>'advance_cents')::bigint = 61500 and d->>'payment_info' is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - R01 ' || coalesce(d::text, 'null'); end if;

  -- R02 regels: niet zonder huisregels, niet korter dan 2 nachten, niet meer dan 4 personen, bod niet onder 80%
  begin perform public.submit_stay_request('aanvraag-a', 'S-1', 'Karim', '0699887766', 2, d1 + 10, d1 + 12, null, null, null, false); msg := null; exception when others then msg := sqlerrm; end;
  begin perform public.submit_stay_request('aanvraag-a', 'S-1', 'Karim', '0699887766', 2, d1 + 10, d1 + 11, null, null, null, true); n := 0; exception when others then n := case when sqlerrm = 'request_min_nights' then 1 else 0 end; end;
  begin perform public.submit_stay_request('aanvraag-a', 'S-1', 'Karim', '0699887766', 6, d1 + 10, d1 + 12, null, null, null, true); exception when others then n := n + case when sqlerrm = 'request_too_many' then 1 else 0 end; end;
  begin perform public.submit_stay_request('aanvraag-a', 'S-1', 'Karim', '0699887766', 2, d1 + 10, d1 + 12, null, null, 50000, true); exception when others then n := n + case when sqlerrm = 'request_offer_low' then 1 else 0 end; end;
  if msg = 'request_rules' and n = 3 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R02 ' || coalesce(msg, 'geen fout') || ' ' || n; end if;

  -- R03 een bod boven 80% kan wel en wordt de prijs
  tok2 := public.submit_stay_request('aanvraag-a', 'S-1', 'Karim Alaoui', '0699887766', 2, d1 + 10, d1 + 12, null, null, 100000, true);
  if (public.public_stay_request(tok2)->'request'->>'total_cents')::bigint = 100000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R03'; end if;
  reset role;

  -- R04 accepteren: optie met betaalgegevens; de data zijn dan bezet voor een ander
  select id into rid from public.stay_requests where token = tok;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.answer_stay_request(rid, 'accept');
  reset role;
  set local role anon;
  d := public.public_stay_request(tok);
  begin perform public.submit_stay_request('aanvraag-a', 'S-1', 'Derde Gast', '0655443322', 2, d1 + 1, d1 + 3, null, null, null, true); msg := null; exception when others then msg := sqlerrm; end;
  if d->>'status' = 'accepted' and d->>'payment_info' like 'RIB%' and msg = 'request_taken'
     and jsonb_array_length(public.public_stay_booking('aanvraag-a', 'S-1')->'busy') = 1 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - R04 ' || coalesce(msg, 'geen fout') || ' ' || coalesce(d::text, 'null'); end if;

  -- R05 de gast meldt betaald; de verhuurder bevestigt: het wordt een boeking met taken
  perform public.guest_stay_request(tok, 'paid');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.answer_stay_request(rid, 'confirm');
  select count(*) into n from public.stays where property_id = prop and status = 'confirmed' and guest_name = 'Nadia Benali' and total_cents = 205000;
  if n = 1 and (select status::text from public.stay_requests where id = rid) = 'confirmed' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R05 ' || n; end if;

  -- R06 een ander kantoor kan een aanvraag niet beantwoorden
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.answer_stay_request((select id from public.stay_requests where token = tok2), 'accept'); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R06 ander kantoor kon accepteren'; end if;
  reset role;

  -- R07 een verlopen optie komt vanzelf weer vrij
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.answer_stay_request((select id from public.stay_requests where token = tok2), 'accept');
  reset role;
  update public.stay_requests set hold_until = now() - interval '1 minute' where token = tok2;
  set local role anon;
  if public.public_stay_request(tok2)->>'status' = 'expired' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R07'; end if;

  -- R08 de gast ziet geen andere gasten en geen telefoonnummers
  d := public.public_stay_request(tok2);
  if d::text not like '%0612345678%' and d::text not like '%Nadia%' and d::text not like '%0699887766%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - R08'; end if;
  reset role;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
