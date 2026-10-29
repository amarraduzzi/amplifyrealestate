-- Test voor Amplify Vitrine fase C (kaart met wijken en blog).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261102000300_vitrine_c.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 5 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); ug uuid := gen_random_uuid(); org_a uuid; d jsonb; msg text;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'bc-a@test.invalid', 'authenticated', 'authenticated'), (ug, 'bc-g@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Blog Agence', 'blog-agence');
  perform public.add_member(org_a, 'bc-g@test.invalid', 'agent');

  -- C01 punten op de kaart en de nieuwe blokken worden bewaard
  update public.organizations set site_area_points = '{"Agdal": [34.0, -6.85]}', site_blocks = array['hero', 'map', 'listings', 'blog'] where id = org_a;
  if (select site_area_points->'Agdal'->>0 from public.organizations where id = org_a) = '34.0' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C01'; end if;

  -- C02 een concept is onzichtbaar; publiceren zet de datum
  insert into public.site_posts (org_id, slug, title, excerpt, body) values (org_a, 'acheter-a-agdal', 'Acheter à Agdal en 2027', 'Les prix, les rues, les conseils.', E'## Les prix\nEnviron 16 000 DH le m².');
  insert into public.site_posts (org_id, slug, title, body, published) values (org_a, 'louer-a-rabat', 'Louer à Rabat', 'Texte', true);
  reset role;
  set local role anon;
  d := public.public_blog('blog-agence');
  if jsonb_array_length(d->'posts') = 1 and d->'posts'->0->>'slug' = 'louer-a-rabat' and d->'posts'->0->>'published_at' is not null
     and public.public_post('blog-agence', 'acheter-a-agdal') is null then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - C02 ' || coalesce(d::text, 'null'); end if;
  reset role;

  -- C03 een agent kan geen artikel schrijven
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.site_posts (org_id, slug, title, body) values (org_a, 'nep', 'Nep artikel', 'x'); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C03 geen fout'; end if;

  -- C04 een bezoeker leest het gepubliceerde artikel met de tekst, en de kantoorpagina toont de punten en het artikel
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.site_posts set published = true where slug = 'acheter-a-agdal';
  reset role;
  set local role anon;
  d := public.public_post('blog-agence', 'acheter-a-agdal');
  if d->'post'->>'body' like '## Les prix%' and jsonb_array_length(d->'more') = 1 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C04 ' || coalesce(d::text, 'null'); end if;
  d := public.public_office_page('blog-agence');
  if d->'site'->'points' ? 'Agdal' and jsonb_array_length(d->'site'->'posts') = 2 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - C05 ' || coalesce(d->>'site', 'null'); end if;
  reset role;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
