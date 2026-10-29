-- Amplify Vitrine: labels "Nouveau" en "Prix en baisse" op de pandkaartjes
--
-- * properties krijgt previous_price_cents en price_drop_at. Een trigger vult die zelf in: gaat de prijs omlaag,
--   dan wordt de oude prijs bewaard; gaat hij omhoog, dan verdwijnt het label. Met de hand invullen kan niet,
--   zodat niemand een nep-prijsverlaging kan tonen.
-- * public_office_page geeft per pand published_at mee (de site toont "Nouveau" de eerste 14 dagen) en de oude prijs,
--   maar alleen tot 30 dagen na de verlaging.

alter table public.properties add column previous_price_cents bigint;
alter table public.properties add column price_drop_at timestamptz;

create function public.track_price_drop()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.previous_price_cents := null; new.price_drop_at := null;
    return new;
  end if;
  if new.price_cents is distinct from old.price_cents then
    if old.price_cents is not null and new.price_cents is not null and new.price_cents < old.price_cents then
      -- bij een tweede verlaging blijft de hoogste prijs van de laatste 30 dagen staan
      new.previous_price_cents := case when old.price_drop_at > now() - interval '30 days' and old.previous_price_cents > old.price_cents
                                       then old.previous_price_cents else old.price_cents end;
      new.price_drop_at := now();
    else
      new.previous_price_cents := null; new.price_drop_at := null;
    end if;
  else
    new.previous_price_cents := old.previous_price_cents; new.price_drop_at := old.price_drop_at;
  end if;
  return new;
end $$;
revoke all on function public.track_price_drop() from public, anon, authenticated;

create trigger properties_price_drop before insert or update on public.properties
  for each row execute function public.track_price_drop();

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
