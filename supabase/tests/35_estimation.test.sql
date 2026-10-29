-- Test voor "Combien vaut mon bien ?" (Amplify Vitrine fase B).
--
-- Gebruik: plak dit hele bestand in de Supabase SQL-editor en klik op Run (nadat
-- 20261102000200_estimation.sql is uitgevoerd). Het script eindigt ALTIJD met een rode melding met het
-- resultaat; alle testgegevens worden daarmee teruggedraaid.
--   "TESTRESULTAAT: 6 geslaagd, 0 mislukt" = alles in orde

do $test$
declare
  ua uuid := gen_random_uuid(); org_a uuid; d jsonb; msg text; n int;
  ok int := 0; bad int := 0; fails text := '';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'es-a@test.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  org_a := public.create_organization('Estim Agence', 'estim-agence');
  -- 3 appartementen te koop in Agdal: 15 000, 16 000 en 20 000 DH per m2 (mediaan 16 000)
  insert into public.properties (org_id, title, purpose, status, property_type, price_cents, area_m2, neighborhood) values
    (org_a, 'A1', 'sale', 'available', 'apartment', 150000000, 100, 'Agdal'),
    (org_a, 'A2', 'sale', 'sold',      'apartment', 160000000, 100, 'agdal'),
    (org_a, 'A3', 'sale', 'available', 'apartment', 200000000, 100, 'Agdal '),
    (org_a, 'B1', 'sale', 'draft',     'apartment', 900000000, 100, 'Agdal'),
    (org_a, 'V1', 'sale', 'available', 'villa',     500000000, 300, 'Souissi');
  reset role;

  set local role anon;
  -- E01 Agdal, 120 m2: 16 000 x 120 = 1 920 000 DH, vork 1 730 000 tot 2 110 000; het concept telt niet mee
  d := public.public_estimate('estim-agence', 'sale', 'apartment', 'Agdal', 120);
  if d->>'scope' = 'neighborhood' and (d->>'count')::int = 3 and (d->>'low')::bigint = 173000000 and (d->>'high')::bigint = 211000000 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - E01 ' || coalesce(d::text, 'null'); end if;

  -- E02 een andere wijk valt terug op alle appartementen van het kantoor
  d := public.public_estimate('estim-agence', 'sale', 'apartment', 'Hay Riad', 100);
  if d->>'scope' = 'office' then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E02 ' || coalesce(d::text, 'null'); end if;

  -- E03 te weinig vergelijkbare panden (1 villa): geen vork
  d := public.public_estimate('estim-agence', 'sale', 'villa', 'Souissi', 300);
  if d->>'scope' = 'none' and not (d ? 'low') then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E03 ' || coalesce(d::text, 'null'); end if;

  -- E04 de eigenaar laat zijn nummer achter: aanvraag, persoon en taak; de vork komt uit de database
  d := public.submit_estimation('estim-agence', 'Mme Benali', '06 11 22 33 44', 'sale', 'apartment', 'Agdal', 120, 3, 'good', 'Je veux vendre en 2027');
  if (d->>'ok')::boolean and (d->'range'->>'low')::bigint = 173000000 then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E04 ' || coalesce(d::text, 'null'); end if;

  -- E05 twee keer verzenden telt een keer; een kapot nummer wordt geweigerd
  perform public.submit_estimation('estim-agence', 'Mme Benali', '0611223344', 'sale', 'apartment', 'Agdal', 120);
  begin perform public.submit_estimation('estim-agence', 'X', '12', 'sale', 'apartment', null, null); msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  select count(*) into n from public.estimation_requests where org_id = org_a;
  if n = 1 and msg like '%estimation_invalid%' and (select count(*) from public.tasks where org_id = org_a and title like 'Rappeler Mme Benali%') = 1 then ok := ok + 1;
  else bad := bad + 1; fails := fails || E'\n - E05 ' || n || ' ' || coalesce(msg, 'geen fout'); end if;

  -- E06 een bezoeker kan de aanvragen niet lezen
  set local role anon;
  begin perform count(*) from public.estimation_requests; msg := null; exception when others then msg := sqlerrm; end;
  reset role;
  if msg is not null then ok := ok + 1; else bad := bad + 1; fails := fails || E'\n - E06 geen fout'; end if;

  raise exception 'TESTRESULTAAT: % geslaagd, % mislukt.%  (Deze rode melding is bedoeld: alle testgegevens zijn teruggedraaid.)',
    ok, bad, fails;
end
$test$;
