-- Test voor de feed met het aanbod van een kantoor.
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261029000600_listing_feed.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 4 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  org_a uuid; tok text; tok2 text; d jsonb; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'fd-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'fd-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Feed Kantoor', 'feed-kantoor');
  perform public.add_member(org_a, 'fd-g@test.invalid', 'agent');
  insert into public.properties (org_id, title, purpose, status, address_note, price_cents)
    values (org_a, 'Appartement Agdal', 'sale', 'available', 'Adresse secrète 9', 150000000);
  insert into public.properties (org_id, title, purpose, status) values (org_a, 'Concept', 'sale', 'draft');

  -- F01 de eigenaar maakt een code; een agent kan dat niet
  tok := public.renew_feed_token(org_a);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.renew_feed_token(org_a); msg := null; exception when others then msg := sqlerrm; end;
  if tok ~ '^[0-9a-f]{64}$' and msg is not null and public.my_feed_token(org_a) is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - F01 ' || coalesce(msg, 'geen fout'); end if;
  reset role;

  -- F02 een bezoeker met de code ziet het kantoor; panden die niet gepubliceerd zijn (of zonder mandaat) en adressen nooit
  set local role anon;
  d := public.public_listing_feed(tok);
  if d->'office'->>'name' = 'Feed Kantoor' and jsonb_array_length(d->'properties') = 0 and d::text not like '%secrète%' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - F02 ' || coalesce(d::text, 'null'); end if;

  -- F03 een verkeerde code geeft niets
  if public.public_listing_feed(repeat('a', 64)) is null and public.public_listing_feed('x') is null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F03'; end if;
  reset role;

  -- F04 vernieuwen maakt de oude code ongeldig
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tok2 := public.renew_feed_token(org_a);
  reset role;
  set local role anon;
  if public.public_listing_feed(tok) is null and public.public_listing_feed(tok2) is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - F04'; end if;

  reset role;
  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
