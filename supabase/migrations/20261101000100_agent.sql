-- Amplify Real Estate: Amplify Agent, het product voor de makelaar die alleen werkt.
--
-- Ontwerpkeuzes:
--  * Een kantoor heeft een uitvoering (edition): 'agence' (zoals tot nu) of 'agent'. Een agent is altijd 1 persoon.
--  * Amplify Agent gratis: plan 'free', 3 panden, altijd open (geen einddatum die afloopt). Betaald: plan 'active'
--    met meer panden, dat zet jij met activate_agent() in de SQL-editor. Een gratis agent wordt dus nooit alleen-lezen.
--  * De eigenaar kiest zelf de uitvoering, maar alleen zolang hij nog niet betaalt (plan 'trial' of 'free').
--    Terug naar 'agence' geeft een proefperiode die eindigt 30 dagen na het aanmaken van het kantoor, met minstens 7 dagen.
--  * Bon de visite: de bezoeker tekent op de telefoon van de makelaar dat hij het pand via hem bezocht. Een bon is
--    bewijs en kan daarom niet gewijzigd of verwijderd worden. De bezoeker krijgt een kopie via een geheime link
--    (public_visit_voucher). Op die kopie staat het telefoonnummer half verborgen en nooit het adres van het pand.

-- ---------------------------------------------------------------------------
-- Uitvoering en gratis plan
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column edition text not null default 'agence' check (edition in ('agence', 'agent'));

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check check (plan in ('trial', 'active', 'free'));

create function public.set_edition(p_org uuid, p_edition text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.organizations;
begin
  if public.my_role(p_org) is distinct from 'owner' then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  if p_edition not in ('agence', 'agent') then
    raise exception 'onbekende_uitvoering' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if o.edition = p_edition then
    return jsonb_build_object('edition', o.edition, 'plan', o.plan);
  end if;
  if o.plan = 'active' then
    raise exception 'uitvoering_betaald_plan' using errcode = '23514';
  end if;

  if p_edition = 'agent' then
    if (select count(*) from public.memberships where org_id = p_org) > 1 then
      raise exception 'agent_heeft_team' using errcode = '23514';
    end if;
    update public.organizations
       set edition = 'agent', plan = 'free', plan_until = date '2099-12-31', max_members = 1, max_properties = 3
     where id = p_org returning * into o;
  else
    update public.organizations
       set edition = 'agence', plan = 'trial',
           plan_until = greatest(o.created_at::date + 30, current_date + 7), max_members = 5, max_properties = 100
     where id = p_org returning * into o;
  end if;
  return jsonb_build_object('edition', o.edition, 'plan', o.plan);
end $$;

-- Alleen voor jou in de SQL-editor: een agent op betaald zetten (of verlengen), bijvoorbeeld:
--   select public.activate_agent('salma-bennani', '2027-10-31');
create function public.activate_agent(p_slug text, p_until date, p_max_properties integer default 1000)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.organizations;
begin
  if p_until is null or p_until < current_date then
    raise exception 'einddatum_in_het_verleden' using errcode = '22023';
  end if;
  update public.organizations
     set edition = 'agent', plan = 'active', plan_until = p_until, max_members = 1, max_properties = greatest(p_max_properties, 1)
   where slug = lower(trim(p_slug))
  returning * into o;
  if not found then
    raise exception 'kantoor_niet_gevonden' using errcode = 'P0002';
  end if;
  return o.name || ': Amplify Agent actief tot ' || o.plan_until || ' (max ' || o.max_properties || ' panden)';
end $$;

create or replace function public.org_plan(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.organizations;
begin
  if not public.is_member(p_org) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = p_org;
  return jsonb_build_object(
    'plan', o.plan,
    'edition', o.edition,
    'plan_until', o.plan_until,
    'days_left', o.plan_until - current_date,
    'is_open', o.plan_until >= current_date,
    'max_members', o.max_members,
    'max_properties', o.max_properties,
    'members', (select count(*) from public.memberships where org_id = p_org),
    'properties', (select count(*) from public.properties where org_id = p_org and status <> 'withdrawn')
  );
end $$;

revoke all on function public.set_edition(uuid, text) from public, anon;
grant execute on function public.set_edition(uuid, text) to authenticated;
revoke all on function public.activate_agent(text, date, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bon de visite
-- ---------------------------------------------------------------------------
create table public.visit_vouchers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  property_id   uuid not null,
  token         text not null unique default encode(gen_random_bytes(18), 'hex'),
  visitor_name  text not null check (char_length(visitor_name) between 2 and 120),
  visitor_phone text not null check (char_length(visitor_phone) between 6 and 40),
  months        smallint not null default 12 check (months between 1 and 36),
  signature     text not null check (signature like 'data:image/png;base64,%' and char_length(signature) <= 200000),
  visited_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index visit_vouchers_org_idx on public.visit_vouchers (org_id, visited_at desc);
create index visit_vouchers_property_idx on public.visit_vouchers (property_id, visited_at desc);

alter table public.visit_vouchers enable row level security;
create policy vouchers_select on public.visit_vouchers
  for select to authenticated using (public.is_member(org_id));
-- geen insert, update of delete voor gebruikers: aanmaken gaat via create_visit_voucher, wijzigen kan nooit
revoke all on table public.visit_vouchers from anon, authenticated;
grant select on public.visit_vouchers to authenticated;

create function public.create_visit_voucher(p_property uuid, p_name text, p_phone text, p_signature text, p_months integer default 12)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v     public.visit_vouchers;
begin
  select org_id into v_org from public.properties where id = p_property;
  if v_org is null or not public.can_write(v_org) then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 8 then
    raise exception 'telefoon_ongeldig' using errcode = '22023';
  end if;
  if coalesce(p_signature, '') not like 'data:image/png;base64,%' then
    raise exception 'handtekening_ontbreekt' using errcode = '22023';
  end if;
  insert into public.visit_vouchers (org_id, property_id, visitor_name, visitor_phone, months, signature, created_by)
  values (v_org, p_property, trim(p_name), trim(p_phone), coalesce(p_months, 12), p_signature, auth.uid())
  returning * into v;
  return jsonb_build_object('id', v.id, 'token', v.token, 'visited_at', v.visited_at);
end $$;

-- De kopie voor de bezoeker. Het telefoonnummer half verborgen, het adres nooit.
create function public.public_visit_voucher(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v public.visit_vouchers;
  o public.organizations;
  p public.properties;
  d text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then
    return null;
  end if;
  select * into v from public.visit_vouchers where token = p_token;
  if not found then
    return null;
  end if;
  select * into o from public.organizations where id = v.org_id;
  select * into p from public.properties where id = v.property_id;
  d := regexp_replace(v.visitor_phone, '\D', '', 'g');
  return jsonb_build_object(
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp,
                                 'phone', o.public_phone, 'agent_name', o.agent_name, 'edition', o.edition),
    'property', jsonb_build_object('reference', p.reference, 'title', p.title, 'property_type', p.property_type,
                                   'purpose', p.purpose, 'city', p.city, 'neighborhood', p.neighborhood),
    'visitor_name', v.visitor_name,
    'visitor_phone', left(d, 2) || repeat('•', greatest(length(d) - 4, 0)) || right(d, 2),
    'months', v.months,
    'visited_at', v.visited_at,
    'signature', v.signature,
    'number', upper(left(v.token, 8))
  );
end $$;

revoke all on function public.create_visit_voucher(uuid, text, text, text, integer) from public, anon;
grant execute on function public.create_visit_voucher(uuid, text, text, text, integer) to authenticated;
revoke all on function public.public_visit_voucher(text) from public;
grant execute on function public.public_visit_voucher(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publieke pagina's weten of het om een agent gaat (dan staat de persoon voorop)
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
