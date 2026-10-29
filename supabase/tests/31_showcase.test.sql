-- Test voor het uithangbord Maroc (titre foncier, kenmerken, contactpersoon, vergelijkbare panden).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261031000100_showcase.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  org_a uuid; org_b uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; pb uuid; ref1 text; d jsonb; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'sc-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'sc-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Vitrine Kantoor', 'vitrine-kantoor');
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents, address_note)
    values (org_a, 'Villa A', 'sale', 'available', 'villa', 500000000, 'Adresse secrète 7') returning id, reference into p1, ref1;
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents)
    values (org_a, 'Villa B', 'sale', 'available', 'villa', 520000000) returning id into p2;
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents)
    values (org_a, 'Studio C', 'rent_long', 'available', 'apartment', 600000) returning id into p3;
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents)
    values (org_a, 'Concept D', 'sale', 'available', 'villa', 500000000) returning id into p4;
  insert into public.property_mandates (org_id, property_id) select org_a, x from unnest(array[p1, p2, p3]) x;
  update public.properties set is_published = true where id in (p1, p2, p3);

  -- S01 de makelaar vult status, kenmerken, verdieping, syndic en afstanden in
  update public.properties set title_status = 'titre', features = array['pool', 'gated'], floor = 0, orientation = 'S',
    syndic_cents = 50000, near_beach = 5, near_mosque = 3 where id = p1;
  if (select title_status from public.properties where id = p1) = 'titre' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S01'; end if;

  -- S02 een onbekend kenmerk of een rare orientatie wordt geweigerd
  begin update public.properties set features = array['jacuzzi'] where id = p1; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then
    begin update public.properties set orientation = 'Z' where id = p1; msg := null; exception when others then msg := sqlerrm; end;
  end if;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - S02 geen fout'; end if;

  -- S03 de contactpersoon: alleen een foto in de map van het eigen kantoor
  update public.organizations set agent_name = 'Salma B.', agent_role = 'Conseillère', agent_langs = array['darija', 'fr'],
    agent_photo = org_a::text || '/agent/' || gen_random_uuid()::text where id = org_a;
  begin update public.organizations set agent_photo = gen_random_uuid()::text || '/agent/' || gen_random_uuid()::text where id = org_a;
    msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null and (select agent_name from public.organizations where id = org_a) = 'Salma B.' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S03 ' || coalesce(msg, 'geen fout'); end if;
  reset role;

  -- S04 een bezoeker ziet de nieuwe velden en de contactpersoon, maar nooit het adres
  set local role anon;
  d := public.public_property_page('vitrine-kantoor', ref1);
  if d->'property'->>'title_status' = 'titre' and d->'property'->'features' ? 'pool' and (d->'property'->'near'->>'beach')::int = 5
     and d->'property'->'near' ? 'school' = false and d->'office'->'agent'->>'name' = 'Salma B.'
     and d->'office'->'agent'->'langs' ? 'darija' and d::text not like '%secrète%' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S04 ' || coalesce(d::text, 'null'); end if;

  -- S05 vergelijkbaar: de andere villa eerst, het concept zonder mandaat nooit, het pand zelf nooit
  if jsonb_array_length(d->'similar') = 2 and d->'similar'->0->>'title' = 'Villa B'
     and d::text not like '%Concept D%' and d->'similar'->1->>'title' = 'Studio C' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S05 ' || coalesce((d->'similar')::text, 'null'); end if;
  reset role;

  -- S06 een ander kantoor kan de contactpersoon of de panden van dit kantoor niet wijzigen
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_b := public.create_organization('Ander Kantoor', 'ander-kantoor');
  update public.organizations set agent_name = 'Indringer' where id = org_a;
  update public.properties set title_status = 'melkia' where id = p1;
  reset role;
  if (select agent_name from public.organizations where id = org_a) = 'Salma B.'
     and (select title_status from public.properties where id = p1) = 'titre' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - S06'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
