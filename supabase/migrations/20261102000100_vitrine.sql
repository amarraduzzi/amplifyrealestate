-- Amplify Real Estate: Amplify Vitrine, fase A. Het kantoor maakt en houdt zijn eigen website bij vanuit de desk.
--
-- Ontwerpkeuzes:
--  * Stijl per kantoor: 'moderne' (licht, strak), 'riad' (warm, zand en terracotta) of 'noir' (donker, luxe),
--    plus een eigen hoofdkleur (#rrggbb) en een logo. De publieke pagina's kleuren daarin mee.
--  * Hero: een eigen grote foto (of anders de omslag van het nieuwste pand), een titel en een ondertitel.
--  * Blokken: het kantoor kiest welke blokken op zijn startpagina staan en in welke volgorde.
--  * Team en klantreviews: eigen tabellen, alleen eigenaar en manager wijzigen ze. Reviews voert het kantoor zelf
--    in; het is hun verantwoordelijkheid dat het echte reviews zijn (dat staat ook in de desk).
--  * Afbeeldingen staan in de bestaande opslag onder {kantoor}/site/{id}; de bestaande opslagregels gelden.

alter table public.organizations
  add column site_theme      text not null default 'moderne' check (site_theme in ('moderne', 'riad', 'noir')),
  add column site_color      text check (site_color is null or site_color ~ '^#[0-9a-fA-F]{6}$'),
  add column site_logo       text,
  add column site_hero       text,
  add column site_hero_title text check (site_hero_title is null or char_length(site_hero_title) <= 90),
  add column site_hero_sub   text check (site_hero_sub   is null or char_length(site_hero_sub)   <= 180),
  add column site_blocks     text[] not null default array['hero', 'listings', 'about', 'team', 'reviews', 'areas', 'contact'];

alter table public.organizations
  add constraint organizations_site_images check (
    (site_logo is null or (site_logo ~ '^[0-9a-f-]{36}/site/[0-9a-f-]{36}$' and split_part(site_logo, '/', 1) = id::text))
    and (site_hero is null or (site_hero ~ '^[0-9a-f-]{36}/(site|[0-9a-f-]{36})/[0-9a-f-]{36}$' and split_part(site_hero, '/', 1) = id::text))
  ),
  add constraint organizations_site_blocks_known check (
    site_blocks <@ array['hero', 'listings', 'projects', 'about', 'team', 'reviews', 'areas', 'contact']::text[]
    and cardinality(site_blocks) <= 8
  );

grant update (site_theme, site_color, site_logo, site_hero, site_hero_title, site_hero_sub, site_blocks)
  on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Team en reviews
-- ---------------------------------------------------------------------------
create table public.site_team (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null check (char_length(name) between 2 and 80),
  role       text check (role is null or char_length(role) <= 80),
  photo      text,
  whatsapp   text check (whatsapp is null or char_length(whatsapp) between 8 and 30),
  langs      text[] not null default '{}' check (langs <@ array['darija', 'fr', 'ar', 'en', 'es', 'nl', 'de', 'tamazight']::text[]),
  sort       smallint not null default 0,
  created_at timestamptz not null default now(),
  check (photo is null or (photo ~ '^[0-9a-f-]{36}/site/[0-9a-f-]{36}$' and split_part(photo, '/', 1) = org_id::text))
);
create index site_team_org_idx on public.site_team (org_id, sort);

create table public.site_reviews (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  author     text not null check (char_length(author) between 2 and 80),
  place      text check (place is null or char_length(place) <= 80),
  body       text not null check (char_length(body) between 10 and 500),
  rating     smallint not null default 5 check (rating between 1 and 5),
  sort       smallint not null default 0,
  created_at timestamptz not null default now()
);
create index site_reviews_org_idx on public.site_reviews (org_id, sort);

alter table public.site_team    enable row level security;
alter table public.site_reviews enable row level security;
create policy site_team_select on public.site_team for select to authenticated using (public.is_member(org_id));
create policy site_team_insert on public.site_team for insert to authenticated with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_team_update on public.site_team for update to authenticated using (public.can_manage(org_id)) with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_team_delete on public.site_team for delete to authenticated using (public.can_manage(org_id));
create policy site_reviews_select on public.site_reviews for select to authenticated using (public.is_member(org_id));
create policy site_reviews_insert on public.site_reviews for insert to authenticated with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_reviews_update on public.site_reviews for update to authenticated using (public.can_manage(org_id)) with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_reviews_delete on public.site_reviews for delete to authenticated using (public.can_manage(org_id));
revoke all on table public.site_team, public.site_reviews from anon, authenticated;
grant select, insert, update, delete on public.site_team, public.site_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- Publieke pagina's met stijl, hero, blokken, team en reviews
-- ---------------------------------------------------------------------------
create or replace function public.public_office_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_list jsonb;
  v_done integer;
begin
  select * into v_org from public.organizations
  where id = public.org_id_for_slug(p_slug) and is_active;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(x.j order by x.pa desc), '[]'::jsonb) into v_list
  from (
    select
      p.published_at as pa,
      jsonb_build_object(
        'reference',     p.reference,
        'title',         p.title,
        'property_type', p.property_type,
        'purpose',       p.purpose,
        'status',        p.status,
        'price_cents',   p.price_cents,
        'currency',      p.currency,
        'city',          p.city,
        'neighborhood',  p.neighborhood,
        'bedrooms',      p.bedrooms,
        'bathrooms',     p.bathrooms,
        'area_m2',       p.area_m2,
        'cover', (
          select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text
          from public.property_photos ph
          where ph.property_id = p.id
          order by ph.is_cover desc, ph.created_at, ph.id
          limit 1
        )
      ) as j
    from public.properties p
    where p.org_id = v_org.id
      and p.is_published
      and p.status in ('available', 'reserved')
      and public.mandate_is_active(p.id)
    order by p.published_at desc
    limit 100
  ) x;

  select count(*) into v_done from public.properties where org_id = v_org.id and status in ('sold', 'rented');

  return jsonb_build_object(
    'office', jsonb_build_object(
      'name',     v_org.name,
      'slug',     v_org.slug,
      'city',     v_org.city,
      'whatsapp', v_org.public_whatsapp,
      'phone',    v_org.public_phone,
      'email',    v_org.public_email,
      'domain',   v_org.custom_domain,
      'edition',  v_org.edition,
      'style', jsonb_build_object('theme', v_org.site_theme, 'color', v_org.site_color, 'logo', v_org.site_logo),
      'links', jsonb_strip_nulls(jsonb_build_object(
        'avito',     v_org.link_avito,
        'mubawab',   v_org.link_mubawab,
        'facebook',  v_org.link_facebook,
        'instagram', v_org.link_instagram,
        'tiktok',    v_org.link_tiktok
      )),
      'agent', case when v_org.agent_name is null then null else jsonb_build_object(
        'name',  v_org.agent_name,
        'role',  v_org.agent_role,
        'photo', v_org.agent_photo,
        'langs', to_jsonb(v_org.agent_langs)
      ) end
    ),
    'site', jsonb_build_object(
      'tagline',  v_org.site_tagline,
      'about',    v_org.site_about,
      'services', v_org.site_services,
      'areas',    v_org.site_areas,
      'done',     v_done,
      'hero',       v_org.site_hero,
      'hero_title', v_org.site_hero_title,
      'hero_sub',   v_org.site_hero_sub,
      'blocks',     to_jsonb(v_org.site_blocks),
      'team', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'role', m.role, 'photo', m.photo,
                                                            'whatsapp', m.whatsapp, 'langs', to_jsonb(m.langs))
                                         order by m.sort, m.created_at), '[]'::jsonb)
               from public.site_team m where m.org_id = v_org.id),
      'reviews', (select coalesce(jsonb_agg(jsonb_build_object('author', r.author, 'place', r.place, 'body', r.body, 'rating', r.rating)
                                            order by r.sort, r.created_at), '[]'::jsonb)
                  from public.site_reviews r where r.org_id = v_org.id)
    ),
    'listings', v_list
  );
end $$;

create or replace function public.public_property_page(p_slug text, p_reference text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org     public.organizations;
  v_prop    public.properties;
  v_photos  jsonb;
  v_similar jsonb;
begin
  select * into v_org from public.organizations
  where id = public.org_id_for_slug(p_slug) and is_active;
  if not found then
    return null;
  end if;

  select * into v_prop from public.properties
  where org_id = v_org.id
    and lower(reference) = lower(trim(p_reference))
    and is_published
    and status in ('available', 'reserved', 'rented', 'sold')
    and public.mandate_is_active(id);
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text
                            order by ph.is_cover desc, ph.created_at, ph.id), '[]'::jsonb)
  into v_photos
  from public.property_photos ph
  where ph.property_id = v_prop.id;

  -- Tot 3 andere panden: zelfde soort aanbod eerst, dan de dichtstbijzijnde prijs.
  select coalesce(jsonb_agg(s.j order by s.rank), '[]'::jsonb) into v_similar
  from (
    select jsonb_build_object(
             'reference',     p.reference,
             'title',         p.title,
             'property_type', p.property_type,
             'purpose',       p.purpose,
             'status',        p.status,
             'price_cents',   p.price_cents,
             'currency',      p.currency,
             'city',          p.city,
             'neighborhood',  p.neighborhood,
             'bedrooms',      p.bedrooms,
             'bathrooms',     p.bathrooms,
             'area_m2',       p.area_m2,
             'cover', (select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text
                       from public.property_photos ph where ph.property_id = p.id
                       order by ph.is_cover desc, ph.created_at, ph.id limit 1)
           ) as j,
           row_number() over (order by (p.purpose <> v_prop.purpose),
                                       (p.property_type <> v_prop.property_type),
                                       abs(coalesce(p.price_cents, 0) - coalesce(v_prop.price_cents, 0)),
                                       p.published_at desc) as rank
    from public.properties p
    where p.org_id = v_org.id
      and p.id <> v_prop.id
      and p.is_published
      and p.status in ('available', 'reserved')
      and public.mandate_is_active(p.id)
    order by rank
    limit 3
  ) s;

  return jsonb_build_object(
    'office', jsonb_build_object(
      'name',     v_org.name,
      'slug',     v_org.slug,
      'city',     v_org.city,
      'whatsapp', v_org.public_whatsapp,
      'phone',    v_org.public_phone,
      'email',    v_org.public_email,
      'style', jsonb_build_object('theme', v_org.site_theme, 'color', v_org.site_color, 'logo', v_org.site_logo),
      'agent', case when v_org.agent_name is null then null else jsonb_build_object(
        'name',  v_org.agent_name,
        'role',  v_org.agent_role,
        'photo', v_org.agent_photo,
        'langs', to_jsonb(v_org.agent_langs)
      ) end
    ),
    'property', jsonb_build_object(
      'reference',         v_prop.reference,
      'title',             v_prop.title,
      'property_type',     v_prop.property_type,
      'purpose',           v_prop.purpose,
      'status',            v_prop.status,
      'price_cents',       v_prop.price_cents,
      'currency',          v_prop.currency,
      'city',              v_prop.city,
      'neighborhood',      v_prop.neighborhood,
      'bedrooms',          v_prop.bedrooms,
      'bathrooms',         v_prop.bathrooms,
      'area_m2',           v_prop.area_m2,
      'furnished',         v_prop.furnished,
      'description',       v_prop.description,
      'info_confirmed_at', v_prop.info_confirmed_at,
      'published_at',      v_prop.published_at,
      'photos',            v_photos,
      'title_status',      v_prop.title_status,
      'features',          to_jsonb(v_prop.features),
      'floor',             v_prop.floor,
      'orientation',       v_prop.orientation,
      'syndic_cents',      v_prop.syndic_cents,
      'near', jsonb_strip_nulls(jsonb_build_object(
        'beach',     v_prop.near_beach,
        'transport', v_prop.near_transport,
        'school',    v_prop.near_school,
        'mosque',    v_prop.near_mosque,
        'shops',     v_prop.near_shops
      ))
    ),
    'similar', v_similar
  );
end $$;
-- create or replace behoudt de bestaande rechten (anon en authenticated mogen de functies aanroepen).
