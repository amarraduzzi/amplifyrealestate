-- Test voor de profiellinks ("Retrouvez-moi aussi sur").
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261101000200_profile_links.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 3 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); org_a uuid; d jsonb; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'pl-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Links Kantoor', 'links-kantoor');

  -- L01 echte profielen worden bewaard
  update public.organizations set link_avito = 'https://www.avito.ma/fr/boutique/salma', link_instagram = 'https://instagram.com/salma.immo'
  where id = org_a;
  if (select link_avito from public.organizations where id = org_a) like '%avito.ma%' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L01'; end if;

  -- L02 een link naar een andere site achter het Avito-logo, of zonder https, wordt geweigerd
  begin update public.organizations set link_avito = 'https://avito.ma.evil.com/x' where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then
    begin update public.organizations set link_facebook = 'http://facebook.com/x' where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  end if;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - L02 geen fout'; end if;
  reset role;

  -- L03 een bezoeker ziet alleen de ingevulde links
  set local role anon;
  d := public.public_office_page('links-kantoor');
  if d->'office'->'links'->>'instagram' = 'https://instagram.com/salma.immo' and not (d->'office'->'links' ? 'tiktok') then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - L03 ' || coalesce(d->'office'->>'links', 'null'); end if;
  reset role;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
