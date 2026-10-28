-- Amplify Vastgoed, etappe 6g: de kantoorwebsite
--
-- De publieke kantoorpagina wordt een volledige website: een slogan, "over ons", diensten, de wijken waar het kantoor
-- werkt, alle online panden met zoeken en filteren, cijfers (online, verkocht of verhuurd) en een contactformulier.
-- Een kantoor kan er ook een eigen domeinnaam aan koppelen (bijvoorbeeld www.atlas-immo.ma).
--
-- Regels:
--  * De teksten en de domeinnaam wijzigen: eigenaar en manager (zelfde regel als de andere kantoorgegevens).
--  * Een domeinnaam hoort bij hooguit een kantoor. Hij wordt opgeslagen zonder http(s):// en zonder / aan het eind.
--  * public_office_by_domain() vertaalt een domeinnaam naar de kantoorcode; met of zonder www. werkt allebei.
--  * public_office_page() geeft nu ook de websiteteksten en twee cijfers terug. Verder ongewijzigd: alleen panden die
--    online staan, met een actief mandaat; nooit adres, eigenaar of notities.

alter table public.organizations
  add column site_tagline  text check (site_tagline  is null or char_length(site_tagline)  <= 140),
  add column site_about    text check (site_about    is null or char_length(site_about)    <= 2000),
  add column site_services text check (site_services is null or char_length(site_services) <= 1500),
  add column site_areas    text check (site_areas    is null or char_length(site_areas)    <= 300),
  add column custom_domain text check (custom_domain is null or custom_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$');

create unique index organizations_custom_domain_idx on public.organizations (custom_domain) where custom_domain is not null;

-- Wat iemand intypt ("https://www.Atlas-Immo.ma/") wordt "www.atlas-immo.ma"
create function public.organizations_clean_domain()
returns trigger language plpgsql as $$
begin
  if new.custom_domain is not null then
    new.custom_domain := nullif(regexp_replace(regexp_replace(lower(trim(new.custom_domain)), '^https?://', ''), '/.*$', ''), '');
  end if;
  return new;
end $$;
create trigger organizations_clean_domain before insert or update of custom_domain on public.organizations
  for each row execute function public.organizations_clean_domain();

grant update (site_tagline, site_about, site_services, site_areas, custom_domain) on public.organizations to authenticated;

-- Domeinnaam -> kantoorcode, voor de publieke website op een eigen domein
create function public.public_office_by_domain(p_host text)
returns text
language sql stable security definer set search_path = public as $$
  with h as (select regexp_replace(lower(trim(coalesce(p_host, ''))), '^www\.', '') as host)
  select o.slug from public.organizations o, h
  where o.is_active and o.custom_domain is not null
    and regexp_replace(o.custom_domain, '^www\.', '') = h.host
  limit 1
$$;

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

  -- Alleen een aantal, nooit welke panden: hoeveel het kantoor verkocht of verhuurd heeft
  select count(*) into v_done from public.properties where org_id = v_org.id and status in ('sold', 'rented');

  return jsonb_build_object(
    'office', jsonb_build_object(
      'name',     v_org.name,
      'slug',     v_org.slug,
      'city',     v_org.city,
      'whatsapp', v_org.public_whatsapp,
      'phone',    v_org.public_phone,
      'email',    v_org.public_email,
      'domain',   v_org.custom_domain
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

revoke all on function public.organizations_clean_domain() from public, anon, authenticated;
revoke all on function public.public_office_by_domain(text) from public;
grant execute on function public.public_office_by_domain(text) to anon, authenticated;
