-- Test voor Amplify Vitrine fase A (stijl, blokken, team en reviews op de publieke pagina's).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261102000100_vitrine.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 5 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  org_a uuid; org_x uuid; p1 uuid; ref1 text; d jsonb; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'vt-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'vt-g@test.invalid', 'authenticated', 'authenticated'),
    (ux, 'vt-x@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Vitrine Agence', 'vitrine-agence');
  perform public.add_member(org_a, 'vt-g@test.invalid', 'agent');

  -- V01 stijl, kleur, hero-tekst en blokken worden bewaard; rare waarden niet
  update public.organizations set site_theme = 'noir', site_color = '#B5562F', site_hero_title = 'Votre maison à Rabat',
    site_blocks = array['hero', 'team', 'listings'] where id = org_a;
  begin update public.organizations set site_color = 'rood' where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  if msg is not null then
    begin update public.organizations set site_blocks = array['hero', 'casino'] where id = org_a; msg := null; exception when others then msg := sqlerrm; end;
  end if;
  if msg is not null and (select site_theme from public.organizations where id = org_a) = 'noir' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - V01 ' || coalesce(msg, 'geen fout'); end if;

  -- V02 een logo mag alleen in de map van het eigen kantoor staan
  begin update public.organizations set site_logo = gen_random_uuid()::text || '/site/' || gen_random_uuid()::text where id = org_a;
    msg := null; exception when others then msg := sqlerrm; end;
  update public.organizations set site_logo = org_a::text || '/site/' || gen_random_uuid()::text where id = org_a;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V02 geen fout'; end if;

  insert into public.site_team (org_id, name, role, langs, sort) values (org_a, 'Salma Bennani', 'Directrice', array['fr', 'darija'], 1);
  insert into public.site_reviews (org_id, author, place, body, rating) values (org_a, 'Famille Alaoui', 'Agdal', 'Très professionnels, nous avons trouvé en deux semaines.', 5);
  insert into public.properties (org_id, title, purpose, status, price_cents) values (org_a, 'Appartement Agdal', 'sale', 'available', 150000000) returning id, reference into p1, ref1;
  insert into public.property_mandates (org_id, property_id) values (org_a, p1);
  update public.properties set is_published = true where id = p1;
  reset role;

  -- V03 een agent of een ander kantoor kan geen team of reviews toevoegen
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.site_reviews (org_id, author, body) values (org_a, 'Nep review', 'Dit is een nep review van een agent.'); msg := null;
  exception when others then msg := sqlerrm; end;
  reset role;
  if msg is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
    set local role authenticated;
    org_x := public.create_organization('Ander', 'ander-vitrine');
    begin insert into public.site_team (org_id, name) values (org_a, 'Indringer'); msg := null; exception when others then msg := sqlerrm; end;
    reset role;
  end if;
  if msg is not null and (select count(*) from public.site_reviews) = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - V03 ' || coalesce(msg, 'geen fout'); end if;

  -- V04 een bezoeker ziet stijl, blokken, team en reviews op de kantoorpagina
  set local role anon;
  d := public.public_office_page('vitrine-agence');
  if d->'office'->'style'->>'theme' = 'noir' and d->'office'->'style'->>'color' = '#B5562F' and d->'site'->>'hero_title' = 'Votre maison à Rabat'
     and d->'site'->'blocks'->>1 = 'team' and d->'site'->'team'->0->>'name' = 'Salma Bennani' and d->'site'->'reviews'->0->>'rating' = '5' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - V04 ' || coalesce(d::text, 'null'); end if;

  -- V05 de pandpagina krijgt dezelfde stijl mee
  d := public.public_property_page('vitrine-agence', ref1);
  if d->'office'->'style'->>'theme' = 'noir' and d->'property'->>'title' = 'Appartement Agdal' then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - V05 ' || coalesce(d::text, 'null'); end if;
  reset role;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
