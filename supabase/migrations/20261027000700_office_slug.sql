-- Amplify Vastgoed, etappe 1h: eigen adresnaam voor de kantoorpagina
--
-- Ontwerpkeuzes:
--  * Eigenaar en manager kunnen de adresnaam van hun kantoor (het deel in de link, bijvoorbeeld /atlas-immobilier) wijzigen.
--  * Een oude adresnaam blijft werken als alias: links die al gedeeld zijn (WhatsApp, visitekaartje) breken niet.
--  * Een alias en een huidige adresnaam kunnen nooit naar twee verschillende kantoren wijzen, en niemand anders kan
--    een oude adresnaam overnemen. Maximaal 5 wijzigingen per kantoor, zodat er geen adresnamen worden opgepot.

create table public.organization_slug_aliases (
  slug       text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  org_id     uuid not null references public.organizations(id),
  created_at timestamptz not null default now()
);
create index organization_slug_aliases_org_idx on public.organization_slug_aliases (org_id);
alter table public.organization_slug_aliases enable row level security;
revoke all on table public.organization_slug_aliases from anon, authenticated;

-- Welk kantoor hoort bij deze adresnaam (huidig of oud)?
create function public.org_id_for_slug(p_slug text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from (
    select id, 0 as ord from public.organizations where slug = lower(trim(p_slug))
    union all
    select org_id, 1 from public.organization_slug_aliases where slug = lower(trim(p_slug))
  ) x order by ord limit 1
$$;
revoke all on function public.org_id_for_slug(text) from public, anon, authenticated;

-- Een nieuw kantoor (of een nieuwe adresnaam) mag geen oude adresnaam van een ander kantoor gebruiken.
create function public.organizations_slug_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.organization_slug_aliases a where a.slug = new.slug and a.org_id <> new.id) then
    raise exception 'adresnaam_bezet' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.organizations_slug_guard() from public, anon, authenticated;
create trigger organizations_slug_guard before insert or update of slug on public.organizations
  for each row execute function public.organizations_slug_guard();

-- Adresnaam wijzigen (alleen eigenaar en manager)
create function public.change_office_slug(p_org uuid, p_slug text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_new text := lower(trim(coalesce(p_slug, '')));
  v_old text;
begin
  if not public.can_manage(p_org) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;
  if v_new !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_new) not between 3 and 40 then
    raise exception 'adresnaam_ongeldig' using errcode = '23514';
  end if;
  if v_new in ('assets', 'api', 'admin', 'app', 'desk', 'www', 'static', 'icon', 'og', 'favicon') then
    raise exception 'adresnaam_gereserveerd' using errcode = '23514';
  end if;

  select slug into v_old from public.organizations where id = p_org for update;
  if v_old = v_new then
    return v_new;
  end if;
  if exists (select 1 from public.organizations where slug = v_new and id <> p_org)
     or exists (select 1 from public.organization_slug_aliases where slug = v_new and org_id <> p_org) then
    raise exception 'adresnaam_bezet' using errcode = '23505';
  end if;

  -- Terug naar een eerdere eigen adresnaam: die wordt weer de hoofdnaam.
  delete from public.organization_slug_aliases where slug = v_new and org_id = p_org;
  if (select count(*) from public.organization_slug_aliases where org_id = p_org) >= 5 then
    raise exception 'adresnaam_te_vaak' using errcode = '23514';
  end if;

  insert into public.organization_slug_aliases (slug, org_id) values (v_old, p_org);
  update public.organizations set slug = v_new where id = p_org;
  return v_new;
end $$;
revoke all on function public.change_office_slug(uuid, text) from public, anon;
grant execute on function public.change_office_slug(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Publieke functies: zoeken nu ook op een oude adresnaam (verder ongewijzigd ten opzichte van etappe 1d).
-- ---------------------------------------------------------------------------
create or replace function public.public_office_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_list jsonb;
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

  return jsonb_build_object(
    'office', jsonb_build_object(
      'name',     v_org.name,
      'slug',     v_org.slug,
      'city',     v_org.city,
      'whatsapp', v_org.public_whatsapp,
      'phone',    v_org.public_phone,
      'email',    v_org.public_email
    ),
    'listings', v_list
  );
end $$;

create or replace function public.public_property_page(p_slug text, p_reference text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_prop public.properties;
  v_photos jsonb;
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

  return jsonb_build_object(
    'office', jsonb_build_object(
      'name',     v_org.name,
      'slug',     v_org.slug,
      'city',     v_org.city,
      'whatsapp', v_org.public_whatsapp,
      'phone',    v_org.public_phone,
      'email',    v_org.public_email
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
      'photos',            v_photos
    )
  );
end $$;
