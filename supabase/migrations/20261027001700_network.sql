-- Amplify Vastgoed, etappe 5a: Amplify Network (samenwerken met andere kantoren)
--
-- Twee kantoren worden partners: het ene kantoor nodigt het andere uit met diens kantoorcode (de slug), het andere
-- kantoor accepteert of weigert. Daarna kan elk kantoor een beschikbaar pand delen met een partner, met een aangeboden
-- percentage van de commissie en een notitie.
--
-- Wat een partner ziet (alleen via network_overview, nooit via de tabellen): titel, referentie, soort, doel, prijs,
-- stad en wijk, kamers, badkamers, oppervlakte, gemeubeld, beschrijving, het percentage, de notitie en de publieke
-- contactgegevens van het kantoor. Nooit het adres, de eigenaar, het mandaat, personen of interne notities.
--
-- Regels:
--  * Uitnodigen, accepteren, weigeren en beeindigen: alleen eigenaar en manager (can_manage), en niet na afloop van het plan.
--  * Delen en stoppen met delen: eigenaar, manager en agent (can_write).
--  * Alleen beschikbare panden kunnen gedeeld worden. Is een pand niet meer beschikbaar, dan ziet de partner het niet meer.
--  * Per paar kantoren is er hooguit een partnerschap (in welke richting dan ook).
--  * Weigeren of beeindigen verwijdert het partnerschap en alle gedeelde panden tussen de twee kantoren.
--
-- Mag opnieuw gedraaid worden: een eerdere versie van het Network wordt eerst verwijderd, inclusief bestaande
-- partnerschappen en gedeelde panden (in de testfase zijn dat alleen testgegevens). Panden zelf blijven staan.

do $drop$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('are_partners', 'request_partnership', 'respond_partnership',
             'end_partnership', 'share_property', 'unshare_property', 'network_overview') loop
    execute 'drop function ' || f.sig || ' cascade';
  end loop;
end $drop$;
drop table if exists public.property_shares cascade;
drop table if exists public.partnerships cascade;
drop type if exists public.partnership_status cascade;

create type public.partnership_status as enum ('pending', 'accepted');

create table public.partnerships (
  id           uuid primary key default gen_random_uuid(),
  from_org     uuid not null references public.organizations(id),
  to_org       uuid not null references public.organizations(id),
  status       public.partnership_status not null default 'pending',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (from_org <> to_org)
);
create unique index partnerships_pair_idx on public.partnerships (least(from_org, to_org), greatest(from_org, to_org));
create index partnerships_to_idx on public.partnerships (to_org);

create table public.property_shares (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  property_id     uuid not null,
  partner_org     uuid not null references public.organizations(id),
  commission_pct  numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  note            text check (note is null or char_length(note) <= 500),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (property_id, partner_org),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  check (org_id <> partner_org)
);
create index property_shares_partner_idx on public.property_shares (partner_org);

create trigger property_shares_touch before update on public.property_shares
  for each row execute function public.touch_updated_at();

-- Zijn twee kantoren partners (geaccepteerd)?
create function public.are_partners(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partnerships
    where status = 'accepted'
      and least(from_org, to_org) = least(p_a, p_b) and greatest(from_org, to_org) = greatest(p_a, p_b)
  )
$$;

-- Uitnodigen met de kantoorcode van het andere kantoor
create function public.request_partnership(p_org uuid, p_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  other uuid;
  new_id uuid;
begin
  if not public.can_manage(p_org) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if not public.org_is_open(p_org) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  select id into other from public.organizations
  where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if other is null then
    raise exception 'No office found with that code.';
  end if;
  if other = p_org then
    raise exception 'That is your own office.';
  end if;
  if exists (select 1 from public.partnerships
             where least(from_org, to_org) = least(p_org, other) and greatest(from_org, to_org) = greatest(p_org, other)) then
    raise exception 'There is already a partnership or an open invitation with this office.';
  end if;
  insert into public.partnerships (from_org, to_org, created_by) values (p_org, other, auth.uid()) returning id into new_id;
  return new_id;
end $$;

-- Een uitnodiging accepteren of weigeren (alleen het uitgenodigde kantoor)
create function public.respond_partnership(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  select * into p from public.partnerships where id = p_id;
  if p.id is null or p.status <> 'pending' or not public.can_manage(p.to_org) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if not public.org_is_open(p.to_org) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if p_accept then
    update public.partnerships set status = 'accepted', accepted_at = now() where id = p_id;
  else
    delete from public.partnerships where id = p_id;
  end if;
end $$;

-- Een partnerschap beeindigen of een eigen uitnodiging intrekken (beide kantoren)
create function public.end_partnership(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  select * into p from public.partnerships where id = p_id;
  if p.id is null or not (public.can_manage(p.from_org) or public.can_manage(p.to_org)) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  delete from public.property_shares
  where (org_id = p.from_org and partner_org = p.to_org) or (org_id = p.to_org and partner_org = p.from_org);
  delete from public.partnerships where id = p_id;
end $$;

-- Een pand delen met een partner, of percentage en notitie wijzigen
create function public.share_property(p_property uuid, p_partner uuid, p_pct numeric, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pr record;
begin
  select id, org_id, status into pr from public.properties where id = p_property;
  if pr.id is null or not public.can_write(pr.org_id) then
    if pr.id is not null and public.is_member(pr.org_id) and not public.org_is_open(pr.org_id) then
      raise exception 'plan_expired' using errcode = '42501';
    end if;
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if not public.are_partners(pr.org_id, p_partner) then
    raise exception 'This office is not your partner.';
  end if;
  if pr.status <> 'available' then
    raise exception 'Only available properties can be shared.';
  end if;
  insert into public.property_shares (org_id, property_id, partner_org, commission_pct, note, created_by)
  values (pr.org_id, pr.id, p_partner, p_pct, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (property_id, partner_org) do update
    set commission_pct = excluded.commission_pct, note = excluded.note;
end $$;

-- Stoppen met delen
create function public.unshare_property(p_property uuid, p_partner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
begin
  select org_id into o from public.properties where id = p_property;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  delete from public.property_shares where property_id = p_property and partner_org = p_partner;
end $$;

-- Alles voor het tabblad Network: de partners en de panden die partners met dit kantoor delen
create function public.network_overview(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status, 'incoming', p.to_org = p_org,
               'org_id', o.id, 'name', o.name, 'city', o.city, 'slug', o.slug)
             order by p.status desc, o.name)
      from public.partnerships p
      join public.organizations o on o.id = case when p.from_org = p_org then p.to_org else p.from_org end
      where p.from_org = p_org or p.to_org = p_org
    ), '[]'::jsonb),
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object(
               'share_id', s.id, 'office', o.name, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone,
               'reference', pr.reference, 'title', pr.title, 'property_type', pr.property_type, 'purpose', pr.purpose,
               'price_cents', pr.price_cents, 'city', pr.city, 'neighborhood', pr.neighborhood,
               'bedrooms', pr.bedrooms, 'bathrooms', pr.bathrooms, 'area_m2', pr.area_m2, 'furnished', pr.furnished,
               'description', pr.description, 'commission_pct', s.commission_pct, 'note', s.note, 'shared_at', s.created_at)
             order by s.created_at desc)
      from public.property_shares s
      join public.properties pr on pr.id = s.property_id
      join public.organizations o on o.id = s.org_id
      where s.partner_org = p_org and pr.status = 'available' and public.are_partners(s.org_id, p_org)
    ), '[]'::jsonb)
  );
end $$;

-- Beveiliging: alleen het eigen kantoor leest zijn gedeelde panden; schrijven gaat alleen via de functies hierboven
alter table public.partnerships enable row level security;
alter table public.property_shares enable row level security;

create policy partnerships_select on public.partnerships
  for select to authenticated using (public.is_member(from_org) or public.is_member(to_org));
create policy property_shares_select on public.property_shares
  for select to authenticated using (public.is_member(org_id));

revoke all on table public.partnerships, public.property_shares from anon, authenticated;
grant select on public.partnerships, public.property_shares to authenticated;

revoke all on function public.are_partners(uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_partnership(uuid, text), public.respond_partnership(uuid, boolean),
  public.end_partnership(uuid), public.share_property(uuid, uuid, numeric, text),
  public.unshare_property(uuid, uuid), public.network_overview(uuid) from public, anon;
grant execute on function public.request_partnership(uuid, text), public.respond_partnership(uuid, boolean),
  public.end_partnership(uuid), public.share_property(uuid, uuid, numeric, text),
  public.unshare_property(uuid, uuid), public.network_overview(uuid) to authenticated;
