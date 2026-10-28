-- Amplify Vastgoed: feed met het aanbod van een kantoor voor portalen (Mubawab, Avito, Sarouty, ...)
--
-- Elk kantoor kan een geheime link maken: https://<publieke site>/feed/<code>.xml. Daar staan alle gepubliceerde,
-- beschikbare panden met een geldig mandaat, met foto's, prijs en kenmerken (en de publieke projectlots uit 10c).
-- Een portaal dat met het kantoor of met Amplify een afspraak heeft, haalt die link regelmatig op.
--
-- Regels: alleen eigenaar en manager maken, vernieuwen of stoppen de link. Nooit het adres, de eigenaar, het mandaat
-- of interne notities in de feed. Vernieuwen maakt de oude link ongeldig.

alter table public.organizations add column feed_token text unique check (feed_token is null or feed_token ~ '^[0-9a-f]{64}$');

create function public.renew_feed_token(p_org uuid, p_on boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.can_manage(p_org) then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  if public.is_member(p_org) and not public.org_is_open(p_org) then raise exception 'plan_expired' using errcode = '42501'; end if;
  v := case when p_on then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') end;
  update public.organizations set feed_token = v where id = p_org;
  return v;
end $$;

-- Alleen eigenaar en manager zien de huidige code
create function public.my_feed_token(p_org uuid)
returns text
language sql stable security definer set search_path = public as $$
  select feed_token from public.organizations where id = p_org and public.can_manage(p_org)
$$;

create function public.public_listing_feed(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.organizations;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into o from public.organizations where feed_token = p_token and is_active;
  if o.id is null then return null; end if;
  return jsonb_build_object(
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'properties', coalesce((select jsonb_agg(jsonb_build_object(
        'reference', p.reference, 'title', p.title, 'property_type', p.property_type, 'purpose', p.purpose, 'price_cents', p.price_cents,
        'city', p.city, 'neighborhood', p.neighborhood, 'bedrooms', p.bedrooms, 'bathrooms', p.bathrooms, 'area_m2', p.area_m2,
        'furnished', p.furnished, 'description', p.description, 'updated_at', p.updated_at,
        'photos', (select coalesce(jsonb_agg(ph.org_id || '/' || ph.property_id || '/' || ph.id order by ph.is_cover desc, ph.created_at), '[]'::jsonb)
                   from public.property_photos ph where ph.property_id = p.id)) order by p.updated_at desc)
      from public.properties p
      where p.org_id = o.id and p.is_published and p.status = 'available' and public.mandate_is_active(p.id)), '[]'::jsonb)
  );
end $$;

revoke all on function public.renew_feed_token(uuid, boolean), public.my_feed_token(uuid), public.public_listing_feed(text) from public;
grant execute on function public.renew_feed_token(uuid, boolean), public.my_feed_token(uuid) to authenticated;
grant execute on function public.public_listing_feed(text) to anon, authenticated;
