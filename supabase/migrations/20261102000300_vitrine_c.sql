-- Amplify Real Estate: Amplify Vitrine, fase C. Een kaart met de wijken en een blog voor het kantoor.
--
-- Ontwerpkeuzes:
--  * Kaart: per wijk één punt (site_area_points: {"Agdal": [34.0, -6.85]}), nooit het adres van een pand.
--    Het kantoor zoekt de wijk op of tikt hem aan op de kaart in de desk. De publieke kaart toont per wijk het aantal
--    panden; een tik opent de wijkpagina.
--  * Blog: artikelen van het kantoor (titel, korte inleiding, omslagfoto, tekst). Alleen gepubliceerde artikelen zijn
--    zichtbaar. De tekst is gewone tekst met ## voor een tussenkop en - voor een opsomming: geen HTML, dus veilig.
--  * Nieuwe blokken 'map' en 'blog' voor de startpagina; bestaande kantoren krijgen ze niet vanzelf (eerst inhoud).

alter table public.organizations
  add column site_area_points jsonb not null default '{}'::jsonb
    check (jsonb_typeof(site_area_points) = 'object' and pg_column_size(site_area_points) <= 20000);
grant update (site_area_points) on public.organizations to authenticated;

alter table public.organizations drop constraint organizations_site_blocks_known;
alter table public.organizations add constraint organizations_site_blocks_known check (
  site_blocks <@ array['hero', 'listings', 'projects', 'about', 'team', 'reviews', 'areas', 'map', 'blog', 'estimate', 'contact']::text[]
  and cardinality(site_blocks) <= 11
);

create table public.site_posts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title        text not null check (char_length(title) between 3 and 140),
  excerpt      text check (excerpt is null or char_length(excerpt) <= 240),
  body         text not null default '' check (char_length(body) <= 30000),
  cover        text,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, slug),
  check (cover is null or (cover ~ '^[0-9a-f-]{36}/site/[0-9a-f-]{36}$' and split_part(cover, '/', 1) = org_id::text))
);
create index site_posts_org_idx on public.site_posts (org_id, published, published_at desc);

-- publiceren zet de datum (een keer); terug naar concept haalt het artikel offline
create function public.site_posts_publish()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if not new.published then
    new.published_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger site_posts_publish before insert or update on public.site_posts
  for each row execute function public.site_posts_publish();

alter table public.site_posts enable row level security;
create policy site_posts_select on public.site_posts for select to authenticated using (public.is_member(org_id));
create policy site_posts_insert on public.site_posts for insert to authenticated with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_posts_update on public.site_posts for update to authenticated using (public.can_manage(org_id)) with check (public.can_manage(org_id) and public.org_is_open(org_id));
create policy site_posts_delete on public.site_posts for delete to authenticated using (public.can_manage(org_id));
revoke all on table public.site_posts from anon, authenticated;
grant select, insert, update, delete on public.site_posts to authenticated;
revoke all on function public.site_posts_publish() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Het blog voor bezoekers
-- ---------------------------------------------------------------------------
create function public.public_blog(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if not found then return null; end if;
  return jsonb_build_object(
    'office', jsonb_build_object('name', v_org.name, 'slug', v_org.slug, 'city', v_org.city, 'whatsapp', v_org.public_whatsapp,
                                 'phone', v_org.public_phone, 'email', v_org.public_email, 'edition', v_org.edition,
                                 'style', jsonb_build_object('theme', v_org.site_theme, 'color', v_org.site_color, 'logo', v_org.site_logo)),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'title', b.title, 'excerpt', b.excerpt, 'cover', b.cover,
                                                           'published_at', b.published_at) order by b.published_at desc), '[]'::jsonb)
              from (select * from public.site_posts where org_id = v_org.id and published order by published_at desc limit 100) b)
  );
end $$;

create function public.public_post(p_slug text, p_post text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_post public.site_posts;
begin
  select * into v_org from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if not found then return null; end if;
  select * into v_post from public.site_posts where org_id = v_org.id and slug = lower(trim(p_post)) and published;
  if not found then return null; end if;
  return jsonb_build_object(
    'office', jsonb_build_object('name', v_org.name, 'slug', v_org.slug, 'city', v_org.city, 'whatsapp', v_org.public_whatsapp,
                                 'phone', v_org.public_phone, 'email', v_org.public_email, 'edition', v_org.edition,
                                 'style', jsonb_build_object('theme', v_org.site_theme, 'color', v_org.site_color, 'logo', v_org.site_logo),
                                 'agent', case when v_org.agent_name is null then null else jsonb_build_object(
                                   'name', v_org.agent_name, 'role', v_org.agent_role, 'photo', v_org.agent_photo, 'langs', to_jsonb(v_org.agent_langs)) end),
    'post', jsonb_build_object('slug', v_post.slug, 'title', v_post.title, 'excerpt', v_post.excerpt, 'body', v_post.body,
                               'cover', v_post.cover, 'published_at', v_post.published_at),
    'more', (select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'title', b.title, 'excerpt', b.excerpt, 'cover', b.cover,
                                                          'published_at', b.published_at) order by b.published_at desc), '[]'::jsonb)
             from (select * from public.site_posts where org_id = v_org.id and published and id <> v_post.id order by published_at desc limit 3) b)
  );
end $$;

revoke all on function public.public_blog(text), public.public_post(text, text) from public;
grant execute on function public.public_blog(text), public.public_post(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kantoorpagina: met de punten van de kaart en de laatste 3 artikelen
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
      'points',     v_org.site_area_points,
      'posts', (select coalesce(jsonb_agg(jsonb_build_object('slug', b.slug, 'title', b.title, 'excerpt', b.excerpt, 'cover', b.cover,
                                                             'published_at', b.published_at) order by b.published_at desc), '[]'::jsonb)
                from (select * from public.site_posts where org_id = v_org.id and published order by published_at desc limit 3) b),
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

