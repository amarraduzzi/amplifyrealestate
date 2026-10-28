-- Test voor etappe 11a: klanten doorsturen en samen verkopen in het Network.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000500_network_collab.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 8 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  org_a uuid; org_b uuid; org_c uuid; prop uuid; pid uuid; sid uuid; ref uuid; col uuid; j jsonb;
  n bigint; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'nc-a@test.invalid', 'authenticated', 'authenticated'), (ub, 'nc-b@test.invalid', 'authenticated', 'authenticated'),
    (uc, 'nc-c@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Collab B', 'collab-b', 'Casablanca');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_c := public.create_organization('Collab C', 'collab-c', 'Tanger');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Collab A', 'collab-a', 'Rabat');
  insert into public.properties (org_id, title, purpose, status, address_note, price_cents)
    values (org_a, 'Villa Souissi', 'sale', 'available', 'Adresse secrète 7', 500000000) returning id into prop;
  pid := public.request_partnership(org_a, 'collab-b');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_partnership(pid, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.share_property(prop, org_b, 40, null);

  -- C01 een klant doorsturen kan niet zonder toestemming, en niet naar een kantoor dat geen partner is
  begin perform public.send_referral(org_a, org_b, 'Karim', '0611223344', 'sale', 'Casablanca', '{}', null, null, 25, false); msg := null; exception when others then msg := sqlerrm; end;
  begin perform public.send_referral(org_a, org_c, 'Karim', '0611223344', 'sale', null, '{}', null, null, 25, true); n := 0; exception when others then n := 1; end;
  if msg = 'referral_no_consent' and n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C01 ' || coalesce(msg, 'geen fout'); end if;

  -- C02 doorsturen met toestemming; B accepteert en de klant is een lead bij B met bron network
  ref := public.send_referral(org_a, org_b, 'Karim Alaoui', '0611223344', 'sale', 'Casablanca', '{apartment}', 300000000, 'Cherche F3', 25, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_referral(ref, true);
  select count(*) into n from public.leads l join public.people p on p.id = l.person_id where l.org_id = org_b and l.source = 'network' and p.full_name = 'Karim Alaoui';
  if n = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C02 leads ' || n; end if;

  -- C03 B sluit af als gelukt met 60 000 DH commissie: vergoeding 25% = 15 000 DH; A ziet het
  perform public.close_referral(ref, true, 6000000);
  perform public.referral_fee_paid(ref, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_work(org_a);
  if (j->'referrals'->0->>'fee_cents')::bigint = 1500000 and j->'referrals'->0->>'fee_paid_on' is not null and (j->'referrals'->0->>'outgoing')::boolean then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - C03 ' || (j->'referrals')::text; end if;

  -- C04 A kan de doorverwijzing van B niet zelf afsluiten (alleen de ontvanger)
  begin perform public.referral_fee_paid(ref, false); msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C04 afzender kon wijzigen'; end if;

  -- C05 B stelt een klant voor op het gedeelde pand; A ziet de klantnaam nog niet en nooit het adres
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sid := (public.network_overview(org_b)->'properties'->0->>'share_id')::uuid;
  col := public.propose_collab(org_b, sid, 'Famille Bennani', 'Visite samedi ?');
  j := public.network_work(org_b);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (public.network_work(org_a)->'collabs'->0->>'client_name') is null and j::text not like '%secrète%' and (j->'collabs'->0->>'partner_share_pct')::numeric = 40 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - C05 ' || j::text; end if;

  -- C06 A accepteert; B kan de commissie niet zetten, A wel
  perform public.respond_collab(col, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.update_collab(col, 'visit', now() + interval '2 days');
  begin perform public.update_collab(col, 'signed', null, 480000000, 12000000); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'collab_listing_only' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C06 ' || coalesce(msg, 'geen fout'); end if;

  -- C07 A zet prijs en commissie en meldt betaald; daarna ligt alles vast
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.update_collab(col, 'signed', null, 480000000, 12000000);
  perform public.update_collab(col, 'paid');
  begin perform public.update_collab(col, 'offer'); msg := null; exception when others then msg := sqlerrm; end;
  if msg = 'collab_closed' and (public.network_work(org_a)->'collabs'->0->>'paid_on') is not null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - C07 ' || coalesce(msg, 'geen fout'); end if;

  -- C08 kantoor C ziet niets en de tabellen zijn direct niet leesbaar
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.network_work(org_c);
  begin select count(*) into n from public.network_collabs; msg := null; exception when others then msg := sqlerrm; end;
  if jsonb_array_length(j->'referrals') = 0 and jsonb_array_length(j->'collabs') = 0 and msg is not null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - C08 ' || j::text; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
