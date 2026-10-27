-- Amplify Vastgoed, etappe 1c: publieke pandpagina's
--
-- Ontwerpkeuzes:
--  * Anonieme bezoekers krijgen GEEN tabelrechten. Ze kunnen alleen twee functies aanroepen
--    (public_office_page en public_property_page). Die geven uitsluitend terug wat publiek bedoeld is:
--    geen adresnotitie, geen personen, geen mandaten, geen interne notities, geen gebruikers-id's.
--  * Een pand is pas zichtbaar als aan ALLE drie voorwaarden voldaan is:
--      1. is_published staat aan (bewuste keuze van een teamlid),
--      2. de status is available, reserved, rented of sold (concept en ingetrokken panden nooit),
--      3. er is een actief mandaat (niet ingetrokken, niet verlopen).
--    Verloopt een mandaat of wordt een pand ingetrokken, dan verdwijnt de pagina vanzelf.
--  * Publiceren kan alleen voor een beschikbaar of gereserveerd pand met een actief mandaat.
--  * Publiceren en offline halen komen in de onveranderlijke geschiedenis van het pand.

-- ---------------------------------------------------------------------------
-- Kolommen
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column public_whatsapp text check (public_whatsapp is null or char_length(public_whatsapp) <= 40),
  add column public_phone    text check (public_phone    is null or char_length(public_phone)    <= 40),
  add column public_email    text check (public_email    is null or char_length(public_email)    <= 200);

comment on column public.organizations.public_whatsapp is 'Staat op de publieke pandpagina''s van dit kantoor.';

alter table public.properties
  add column is_published boolean not null default false,
  add column published_at timestamptz;

comment on column public.properties.is_published is
  'Bewuste keuze om de publieke pagina aan te zetten. Zie public_property_page voor wanneer hij ook echt zichtbaar is.';

-- Een kantoor kan geen naam krijgen die botst met een vaste pad van de site (bijvoorbeeld /assets).
-- NOT VALID: geldt voor nieuwe en gewijzigde rijen; bestaande kantoren blijven zoals ze zijn.
alter table public.organizations
  add constraint organizations_slug_reserved
  check (slug not in ('assets', 'api', 'admin', 'app', 'desk', 'www', 'static', 'icon', 'og', 'favicon')) not valid;

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

-- Heeft dit pand een actief mandaat? (Zelfde regel als in de app: actief en de einddatum nog niet voorbij.)
create function public.mandate_is_active(p_property uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.property_mandates m
    where m.property_id = p_property
      and m.status = 'active'
      and (m.valid_until is null or m.valid_until >= current_date)
  )
$$;

-- Controle bij het aanzetten van de publieke pagina + published_at bijhouden.
-- Wordt een pand concept of ingetrokken, dan gaat de pagina automatisch offline en moet je hem later
-- bewust opnieuw aanzetten (een oud pand komt zo nooit stilletjes terug online).
create function public.properties_publish_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_was boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was := old.is_published;
    if new.status in ('draft', 'withdrawn') then
      new.is_published := false;
    end if;
  end if;

  if new.is_published then
    if not v_was then
      if new.status not in ('available', 'reserved') then
        raise exception 'publiceren_vereist_beschikbaar_pand' using errcode = '23514';
      end if;
      if not public.mandate_is_active(new.id) then
        raise exception 'publiceren_vereist_actief_mandaat' using errcode = '23514';
      end if;
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end $$;

create trigger properties_publish_guard
  before insert or update on public.properties
  for each row execute function public.properties_publish_guard();

-- Geschiedenis: zelfde functie als in etappe 1a, met erbij "gepubliceerd / offline gehaald".
create or replace function public.log_property_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.property_status_history (org_id, property_id, changed_by, field, old_value, new_value)
    values (new.org_id, new.id, auth.uid(), 'created', null, new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.property_status_history (org_id, property_id, changed_by, field, old_value, new_value)
    values (new.org_id, new.id, auth.uid(), 'status', old.status::text, new.status::text);
  end if;
  if new.price_cents is distinct from old.price_cents then
    insert into public.property_status_history (org_id, property_id, changed_by, field, old_value, new_value)
    values (new.org_id, new.id, auth.uid(), 'price_cents', old.price_cents::text, new.price_cents::text);
  end if;
  if new.info_confirmed_at is distinct from old.info_confirmed_at then
    insert into public.property_status_history (org_id, property_id, changed_by, field, old_value, new_value)
    values (new.org_id, new.id, auth.uid(), 'info_confirmed_at', old.info_confirmed_at::text, new.info_confirmed_at::text);
  end if;
  if new.is_published is distinct from old.is_published then
    insert into public.property_status_history (org_id, property_id, changed_by, field, old_value, new_value)
    values (new.org_id, new.id, auth.uid(), 'is_published', old.is_published::text, new.is_published::text);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Voor de app (ingelogde teamleden): is de pagina echt zichtbaar, en zo niet, waarom niet?
-- Antwoord: live | offline | hidden_status | hidden_mandate (of null als je geen lid bent)
-- ---------------------------------------------------------------------------
create function public.property_public_state(p_property uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v public.properties;
begin
  select * into v from public.properties where id = p_property;
  if not found or not public.is_member(v.org_id) then
    return null;
  end if;
  if not v.is_published then return 'offline'; end if;
  if v.status not in ('available', 'reserved', 'rented', 'sold') then return 'hidden_status'; end if;
  if not public.mandate_is_active(v.id) then return 'hidden_mandate'; end if;
  return 'live';
end $$;

-- ---------------------------------------------------------------------------
-- Voor de publieke site (anonieme bezoekers). Geeft null terug als er niets (meer) te zien is.
-- ---------------------------------------------------------------------------

-- Kantoorpagina: kantoorgegevens + lijst met beschikbare en gereserveerde panden (maximaal 100, nieuwste eerst)
create function public.public_office_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_list jsonb;
begin
  select * into v_org from public.organizations
  where slug = lower(trim(p_slug)) and is_active;
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
        'area_m2',       p.area_m2
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

-- Pandpagina: alles wat een klant mag zien. Een verhuurd of verkocht pand blijft zichtbaar (met melding),
-- zodat een oude WhatsApp-link niet op een foutpagina uitkomt.
create function public.public_property_page(p_slug text, p_reference text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  public.organizations;
  v_prop public.properties;
begin
  select * into v_org from public.organizations
  where slug = lower(trim(p_slug)) and is_active;
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
      'published_at',      v_prop.published_at
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Rechten
-- ---------------------------------------------------------------------------
-- Kantoorgegevens voor de publieke pagina mogen eigenaar en manager aanpassen (RLS: can_manage).
grant update (public_whatsapp, public_phone, public_email) on public.organizations to authenticated;

-- Interne functies: niemand roept ze rechtstreeks aan.
revoke all on function public.mandate_is_active(uuid), public.properties_publish_guard()
  from public, anon, authenticated;

-- Voor ingelogde teamleden
revoke all on function public.property_public_state(uuid) from public, anon;
grant execute on function public.property_public_state(uuid) to authenticated;

-- Voor iedereen (de publieke site)
revoke all on function public.public_office_page(text), public.public_property_page(text, text) from public;
grant execute on function public.public_office_page(text), public.public_property_page(text, text) to anon, authenticated;
