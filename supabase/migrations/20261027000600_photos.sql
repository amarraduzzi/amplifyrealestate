-- Amplify Vastgoed, etappe 1d: foto's bij panden
--
-- Ontwerpkeuzes:
--  * Bestanden staan in een openbare Storage-bucket 'property-photos' met onraadbare paden
--    ({org_id}/{pand_id}/{foto_id}.jpg en {foto_id}_t.jpg als klein voorbeeld). Niemand kan de bucket
--    uitlezen of doorzoeken; je kunt een foto alleen openen als je het volledige pad kent.
--    Dat pad komt alleen uit public_property_page / public_office_page, dus alleen voor zichtbare panden.
--  * De desk verkleint elke foto in de browser (max 1600 px, JPEG) voordat hij wordt geupload.
--  * Uploaden en verwijderen mogen eigenaar, manager en agent van het kantoor van het pand (path-controle).
--  * Maximaal 20 foto's per pand. De eerste foto wordt automatisch de omslagfoto; verwijder je die,
--    dan wordt de oudste overgebleven foto de omslag.

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
create table public.property_photos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  property_id uuid not null,
  is_cover    boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index property_photos_property_idx on public.property_photos (property_id, created_at);
create unique index property_photos_one_cover on public.property_photos (property_id) where is_cover;

create function public.photos_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.property_photos where property_id = new.property_id;
  if v_n >= 20 then
    raise exception 'maximaal_20_fotos' using errcode = '23514';
  end if;
  new.is_cover := (v_n = 0);
  return new;
end $$;

create trigger photos_before_insert before insert on public.property_photos
  for each row execute function public.photos_before_insert();
create trigger photos_created_by before insert on public.property_photos
  for each row execute function public.set_created_by();

-- Verwijder je de omslagfoto, dan neemt de oudste overgebleven foto het over.
create function public.photos_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_cover then
    update public.property_photos set is_cover = true
    where id = (
      select id from public.property_photos where property_id = old.property_id
      order by created_at, id limit 1
    );
  end if;
  return null;
end $$;

create trigger photos_after_delete after delete on public.property_photos
  for each row execute function public.photos_after_delete();

-- Omslagfoto kiezen
create function public.set_property_cover(p_photo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.property_photos;
begin
  select * into v from public.property_photos where id = p_photo;
  if not found or not public.can_write(v.org_id) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;
  update public.property_photos set is_cover = false where property_id = v.property_id and is_cover and id <> p_photo;
  update public.property_photos set is_cover = true  where id = p_photo;
end $$;

-- Rechten per rij
alter table public.property_photos enable row level security;
create policy photos_select on public.property_photos
  for select to authenticated using (public.is_member(org_id));
create policy photos_insert on public.property_photos
  for insert to authenticated with check (public.can_write(org_id));
create policy photos_delete on public.property_photos
  for delete to authenticated using (public.can_write(org_id));

revoke all on table public.property_photos from anon, authenticated;
grant select, insert, delete on public.property_photos to authenticated;

revoke all on function public.photos_before_insert(), public.photos_after_delete() from public, anon, authenticated;
revoke all on function public.set_property_cover(uuid) from public, anon;
grant execute on function public.set_property_cover(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Opslag (Supabase Storage)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

-- Het eerste deel van het pad is het kantoor: alleen wie daar mag schrijven, mag uploaden of verwijderen.
create function public.storage_photo_org_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_write(split_part(p_name, '/', 1)::uuid)
    else false
  end
$$;
revoke all on function public.storage_photo_org_ok(text) from public, anon;
grant execute on function public.storage_photo_org_ok(text) to authenticated;

create policy photos_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'property-photos' and public.storage_photo_org_ok(name));
create policy photos_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'property-photos' and public.storage_photo_org_ok(name));
create policy photos_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'property-photos' and public.storage_photo_org_ok(name));

-- ---------------------------------------------------------------------------
-- Publieke functies: nu met foto's. Zelfde regels als in 1c, een pand dat niet zichtbaar is geeft geen foto's.
-- 'cover' en 'photos' zijn paden zonder extensie: .jpg voor groot, _t.jpg voor klein.
-- ---------------------------------------------------------------------------
create or replace function public.public_office_page(p_slug text)
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
-- create or replace behoudt de rechten uit etappe 1c (alleen anon en authenticated mogen de functies aanroepen).
