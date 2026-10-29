-- Amplify Real Estate: "Retrouvez-moi aussi sur". De links naar de profielen van het kantoor of de makelaar op
-- Avito, Mubawab, Facebook, Instagram en TikTok, op de publieke pagina van het kantoor.
--
-- Ontwerpkeuzes:
--  * Een link moet met https:// beginnen en bij het juiste platform horen (avito.ma, mubawab.ma, facebook.com, ...),
--    zodat er nooit een vreemde site achter een vertrouwd logo staat.
--  * Alleen het profiel, niet per pand: de klant blijft op de eigen pagina van het kantoor.

alter table public.organizations
  add column link_avito     text check (link_avito     is null or (char_length(link_avito)     <= 300 and link_avito     ~* '^https://([a-z0-9-]+\.)*avito\.ma(/|$)')),
  add column link_mubawab   text check (link_mubawab   is null or (char_length(link_mubawab)   <= 300 and link_mubawab   ~* '^https://([a-z0-9-]+\.)*mubawab\.ma(/|$)')),
  add column link_facebook  text check (link_facebook  is null or (char_length(link_facebook)  <= 300 and link_facebook  ~* '^https://([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me)(/|$)')),
  add column link_instagram text check (link_instagram is null or (char_length(link_instagram) <= 300 and link_instagram ~* '^https://([a-z0-9-]+\.)*instagram\.com(/|$)')),
  add column link_tiktok    text check (link_tiktok    is null or (char_length(link_tiktok)    <= 300 and link_tiktok    ~* '^https://([a-z0-9-]+\.)*tiktok\.com(/|$)'));

grant update (link_avito, link_mubawab, link_facebook, link_instagram, link_tiktok) on public.organizations to authenticated;

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
      'done',     v_done
    ),
    'listings', v_list
  );
end $$;
