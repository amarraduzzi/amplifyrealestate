-- Amplify Vitrine: blok "Coup de cœur" (een uitgelicht pand op de homepage)
-- * organizations.site_featured: de referentie van het pand dat het kantoor uitlicht.
-- * Nieuw blok 'featured' in site_blocks.
-- * public_office_page geeft het uitgelichte pand mee, met een korte tekst, maar alleen als het pand nog online staat.

alter table public.organizations add column site_featured text check (site_featured is null or site_featured ~ '^[A-Za-z0-9-]{2,40}$');
grant update (site_featured) on public.organizations to authenticated;

alter table public.organizations drop constraint organizations_site_blocks_known;
alter table public.organizations add constraint organizations_site_blocks_known check (
  site_blocks <@ array['hero', 'featured', 'listings', 'projects', 'about', 'team', 'reviews', 'areas', 'map', 'blog', 'estimate', 'contact']::text[]
  and cardinality(site_blocks) <= 12
);

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
        'published_at',  p.published_at,
        'old_price_cents', case when p.price_drop_at > now() - interval '30 days' and p.previous_price_cents > p.price_cents
                                then p.previous_price_cents end,
        'cover', (
          select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text
          from public.property_photos ph
          where ph.property_id = p.id
          order by ph.is_cover desc, ph.created_at, ph.id
          limit 1
        ),
        'photos', (
          select coalesce(jsonb_agg(z.path order by z.n), '[]'::jsonb) from (
            select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text as path,
                   row_number() over (order by ph.is_cover desc, ph.created_at, ph.id) as n
            from public.property_photos ph
            where ph.property_id = p.id
            order by ph.is_cover desc, ph.created_at, ph.id
            limit 5
          ) z
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
      'featured', (
        select jsonb_build_object('reference', f.reference, 'excerpt', left(regexp_replace(coalesce(f.description, ''), '\s+', ' ', 'g'), 240))
        from public.properties f
        where f.org_id = v_org.id and f.reference = v_org.site_featured
          and f.is_published and f.status in ('available', 'reserved') and public.mandate_is_active(f.id)
      ),
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
