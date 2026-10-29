-- Amplify Real Estate: uithangbord Maroc. Wat een Marokkaanse koper als eerste wil weten, op de pandpagina.
--
-- Ontwerpkeuzes:
--  * Per pand: de juridische status (titre foncier, melkia, titre en cours), een vaste lijst kenmerken
--    (residence fermee, gardien, ascenseur, ...), verdieping, orientatie, syndic per maand en de afstand in
--    minuten tot plage, transport, ecole, mosquee en commerces. Kenmerken zijn sleutels uit een vaste lijst,
--    zodat ze in elke taal goed op de pagina komen.
--  * Per kantoor: een contactpersoon voor de publieke pagina's (naam, functie, foto, talen). De foto staat in
--    dezelfde opslag als de pandfoto's, onder {kantoor}/agent/{id}; de bestaande opslagregels gelden dus al.
--  * public_property_page geeft deze velden mee, plus de contactpersoon en tot 3 vergelijkbare panden van
--    hetzelfde kantoor (zelfde regels als de kantoorpagina: gepubliceerd, beschikbaar of gereserveerd, mandaat).
--  * Het adres blijft geheim: er komt alleen bij wat het kantoor zelf invult.

-- ---------------------------------------------------------------------------
-- Pand
-- ---------------------------------------------------------------------------
create type public.title_status as enum ('titre', 'melkia', 'en_cours');

alter table public.properties
  add column title_status  public.title_status,
  add column features      text[] not null default '{}',
  add column floor         smallint check (floor is null or floor between -3 and 80),
  add column orientation   text check (orientation is null or orientation in ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')),
  add column syndic_cents  bigint check (syndic_cents is null or syndic_cents between 0 and 10000000),
  add column near_beach    smallint check (near_beach    is null or near_beach    between 0 and 240),
  add column near_transport smallint check (near_transport is null or near_transport between 0 and 240),
  add column near_school   smallint check (near_school   is null or near_school   between 0 and 240),
  add column near_mosque   smallint check (near_mosque   is null or near_mosque   between 0 and 240),
  add column near_shops    smallint check (near_shops    is null or near_shops    between 0 and 240);

alter table public.properties
  add constraint properties_features_known check (
    features <@ array['gated', 'guard', 'elevator', 'parking', 'pool', 'garden', 'terrace', 'sea_view',
                      'air_con', 'equipped_kitchen', 'fiber', 'solar']::text[]
    and cardinality(features) <= 12
  );

comment on column public.properties.title_status is 'Juridische status: titre foncier, melkia of titre en cours. Komt op de publieke pagina.';
comment on column public.properties.features is 'Kenmerken uit een vaste lijst (gated, guard, elevator, ...). De pagina vertaalt ze.';

-- ---------------------------------------------------------------------------
-- Contactpersoon van het kantoor
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column agent_name  text check (agent_name is null or char_length(agent_name) between 2 and 80),
  add column agent_role  text check (agent_role is null or char_length(agent_role) <= 80),
  add column agent_photo text,
  add column agent_langs text[] not null default '{}';

alter table public.organizations
  add constraint organizations_agent_photo_path check (
    agent_photo is null
    or (agent_photo ~ '^[0-9a-f-]{36}/agent/[0-9a-f-]{36}$' and split_part(agent_photo, '/', 1) = id::text)
  ),
  add constraint organizations_agent_langs_known check (
    agent_langs <@ array['darija', 'fr', 'ar', 'en', 'es', 'nl', 'de', 'tamazight']::text[]
  );

grant update (agent_name, agent_role, agent_photo, agent_langs) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Publieke pandpagina: met de nieuwe velden, de contactpersoon en vergelijkbare panden
-- ---------------------------------------------------------------------------
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
-- create or replace behoudt de bestaande rechten (anon en authenticated mogen de functie aanroepen).
