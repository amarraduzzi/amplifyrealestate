-- Amplify Real Estate: Amplify Vitrine, fase B. "Combien vaut mon bien ?" op de site van het kantoor.
--
-- Ontwerpkeuzes:
--  * Een eigenaar vult zijn bien in (type, verkopen of verhuren, wijk, oppervlakte) en ziet meteen een prijsvork.
--    Die vork komt uit de eigen panden van het kantoor: de mediaan van de prijs per m2 van vergelijkbare panden
--    (zelfde doel en type; eerst dezelfde wijk, anders alle panden van het kantoor). Pas vanaf 3 vergelijkbare panden
--    tonen we een vork, anders alleen "een adviseur belt u terug". Er komt nooit een los pand of een prijs van één
--    pand naar buiten, alleen een afgerond gemiddelde.
--  * Laat de eigenaar zijn nummer achter, dan maakt de database de persoon, een schattingsaanvraag en een taak
--    "Rappeler ... (estimation)" voor vandaag. Een eigenaar is geen koper: daarom een eigen tabel, geen lead.
--  * Bescherming zoals bij submit_inquiry: verborgen veld voor robots, hetzelfde nummer telt een keer per 10 minuten,
--    hooguit 20 aanvragen per uur per kantoor. De vork wordt in de database opnieuw berekend, nooit overgenomen.
--  * Nieuw blok 'estimate' voor de startpagina; bestaande kantoren krijgen het vóór het contactblok.

alter table public.organizations drop constraint organizations_site_blocks_known;
alter table public.organizations add constraint organizations_site_blocks_known check (
  site_blocks <@ array['hero', 'listings', 'projects', 'about', 'team', 'reviews', 'areas', 'estimate', 'contact']::text[]
  and cardinality(site_blocks) <= 9
);
alter table public.organizations alter column site_blocks
  set default array['hero', 'listings', 'about', 'team', 'reviews', 'areas', 'estimate', 'contact'];
update public.organizations
   set site_blocks = case when 'contact' = any(site_blocks)
                          then array_remove(site_blocks, 'contact') || array['estimate', 'contact']
                          else site_blocks || array['estimate'] end
 where not ('estimate' = any(site_blocks));

create type public.estimation_status as enum ('new', 'contacted', 'mandate', 'lost');

create table public.estimation_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  person_id    uuid,
  purpose      public.deal_purpose not null,
  property_type public.property_type not null,
  neighborhood text check (neighborhood is null or char_length(neighborhood) <= 80),
  area_m2      numeric(8,2) check (area_m2 is null or area_m2 between 10 and 20000),
  bedrooms     smallint check (bedrooms is null or bedrooms between 0 and 30),
  condition    text check (condition is null or condition in ('new', 'good', 'to_refresh', 'to_renovate')),
  message      text check (message is null or char_length(message) <= 1000),
  low_cents    bigint,
  high_cents   bigint,
  status       public.estimation_status not null default 'new',
  created_at   timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id)
);
create index estimation_requests_org_idx on public.estimation_requests (org_id, created_at desc);

alter table public.estimation_requests enable row level security;
create policy estimations_select on public.estimation_requests for select to authenticated using (public.is_member(org_id));
create policy estimations_update on public.estimation_requests for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
revoke all on table public.estimation_requests from anon, authenticated;
grant select on public.estimation_requests to authenticated;
grant update (status) on public.estimation_requests to authenticated;

-- ---------------------------------------------------------------------------
-- De prijsvork
-- ---------------------------------------------------------------------------
create function public.estimate_range(p_org uuid, p_purpose public.deal_purpose, p_type public.property_type, p_neighborhood text, p_area numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_key   text := translate(lower(trim(coalesce(p_neighborhood, ''))), 'éèêëàâäîïôöûüç', 'eeeeaaaiioouuc');
  v_n     integer;
  v_m2    numeric;
  v_scope text := 'neighborhood';
  v_step  numeric;
begin
  if p_area is null or p_area < 10 or p_area > 20000 then
    return jsonb_build_object('scope', 'none');
  end if;
  -- vergelijkbaar: zelfde kantoor, doel en type, met prijs en oppervlakte, geen concept of ingetrokken pand
  select count(*), percentile_cont(0.5) within group (order by price_cents / area_m2)
    into v_n, v_m2
  from public.properties
  where org_id = p_org and purpose = p_purpose and property_type = p_type
    and status not in ('draft', 'withdrawn') and price_cents > 0 and area_m2 > 0
    and v_key <> '' and translate(lower(trim(coalesce(neighborhood, ''))), 'éèêëàâäîïôöûüç', 'eeeeaaaiioouuc') = v_key;
  if coalesce(v_n, 0) < 3 then
    v_scope := 'office';
    select count(*), percentile_cont(0.5) within group (order by price_cents / area_m2)
      into v_n, v_m2
    from public.properties
    where org_id = p_org and purpose = p_purpose and property_type = p_type
      and status not in ('draft', 'withdrawn') and price_cents > 0 and area_m2 > 0;
  end if;
  if coalesce(v_n, 0) < 3 or v_m2 is null then
    return jsonb_build_object('scope', 'none');
  end if;
  -- afronden: verkoop op 10 000 DH, huur op 100 DH (in centimes)
  v_step := case when p_purpose = 'sale' then 1000000 else 10000 end;
  return jsonb_build_object(
    'scope', v_scope,
    'count', v_n,
    'low',  (round(v_m2 * p_area * 0.9 / v_step) * v_step)::bigint,
    'high', (round(v_m2 * p_area * 1.1 / v_step) * v_step)::bigint,
    'per_m2', (round(v_m2 / case when p_purpose = 'sale' then 10000 else 100 end) * case when p_purpose = 'sale' then 10000 else 100 end)::bigint
  );
end $$;

create function public.public_estimate(p_slug text, p_purpose text, p_type text, p_neighborhood text, p_area numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if v_org is null or p_purpose not in ('sale', 'rent_long', 'rent_short')
     or p_type not in ('apartment', 'villa', 'riad', 'house', 'land', 'shop', 'office', 'building', 'other') then
    return null;
  end if;
  return public.estimate_range(v_org, p_purpose::public.deal_purpose, p_type::public.property_type, p_neighborhood, p_area);
end $$;

-- ---------------------------------------------------------------------------
-- De eigenaar laat zijn nummer achter
-- ---------------------------------------------------------------------------
create function public.submit_estimation(
  p_slug text, p_name text, p_phone text, p_purpose text, p_type text, p_neighborhood text, p_area numeric,
  p_bedrooms integer default null, p_condition text default null, p_message text default null, p_trap text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o        public.organizations;
  v_name   text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 120);
  v_phone  text := left(trim(coalesce(p_phone, '')), 40);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail   text;
  v_person uuid;
  v_range  jsonb;
  v_id     uuid;
  v_hood   text := nullif(left(trim(coalesce(p_neighborhood, '')), 80), '');
  v_msg    text := nullif(left(trim(coalesce(p_message, '')), 1000), '');
  v_label  text;
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if char_length(v_name) < 2 or char_length(v_digits) not between 8 and 15
     or p_purpose not in ('sale', 'rent_long', 'rent_short')
     or p_type not in ('apartment', 'villa', 'riad', 'house', 'land', 'shop', 'office', 'building', 'other')
     or (p_condition is not null and p_condition not in ('new', 'good', 'to_refresh', 'to_renovate')) then
    raise exception 'estimation_invalid' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if o.id is null then
    raise exception 'estimation_invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.estimation_requests where org_id = o.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'estimation_busy' using errcode = '54000';
  end if;
  v_tail := right(v_digits, 9);

  select id into v_person from public.people
  where org_id = o.id
    and (right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_tail
      or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail)
  order by created_at limit 1;
  if v_person is not null and exists (
       select 1 from public.estimation_requests where person_id = v_person and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true);
  end if;
  if v_person is null then
    insert into public.people (org_id, full_name, phone, whatsapp, notes)
    values (o.id, v_name, v_phone, v_phone, 'Propriétaire, via l''estimation en ligne')
    returning id into v_person;
  end if;

  v_range := public.estimate_range(o.id, p_purpose::public.deal_purpose, p_type::public.property_type, v_hood,
                                   case when p_area between 10 and 20000 then p_area end);
  insert into public.estimation_requests (org_id, person_id, purpose, property_type, neighborhood, area_m2, bedrooms,
                                          condition, message, low_cents, high_cents)
  values (o.id, v_person, p_purpose::public.deal_purpose, p_type::public.property_type, v_hood,
          case when p_area between 10 and 20000 then p_area end,
          case when p_bedrooms between 0 and 30 then p_bedrooms end, p_condition, v_msg,
          (v_range->>'low')::bigint, (v_range->>'high')::bigint)
  returning id into v_id;

  v_label := case p_purpose when 'sale' then 'vendre' else 'louer' end;
  insert into public.tasks (org_id, title, notes, due_date)
  values (o.id, left('Rappeler ' || v_name || ' (estimation, veut ' || v_label || ')', 200),
          left(concat_ws(E'\n', nullif(concat_ws(' · ', v_hood, case when p_area is not null then p_area::text || ' m²' end), ''), v_msg), 1000),
          current_date);
  perform public.bump_page_stat(o.id, null, 'form');
  return jsonb_build_object('ok', true, 'range', v_range);
end $$;

revoke all on function public.estimate_range(uuid, public.deal_purpose, public.property_type, text, numeric) from public, anon, authenticated;
revoke all on function public.public_estimate(text, text, text, text, numeric) from public;
grant execute on function public.public_estimate(text, text, text, text, numeric) to anon, authenticated;
revoke all on function public.submit_estimation(text, text, text, text, text, text, numeric, integer, text, text, text) from public;
grant execute on function public.submit_estimation(text, text, text, text, text, text, numeric, integer, text, text, text) to anon, authenticated;
