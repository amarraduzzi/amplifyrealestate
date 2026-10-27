-- Amplify Vastgoed, etappe 1b-5: bezichtigingen en teambeheer
--
-- Een bezichtiging is een afspraak tussen een lead en een pand, met een uitkomst achteraf.
-- Zelfde regels als de rest: elke rij hoort bij een organisatie, geen verwijderen (status 'cancelled'
-- gebruiken), verwijzen over organisaties heen kan niet.
-- Teambeheer: ledenlijst met e-mailadres, en leden verwijderen. Rol wijzigen en toevoegen kan al met
-- add_member uit etappe 1a.

create type public.viewing_status  as enum ('scheduled', 'done', 'cancelled', 'no_show');
create type public.viewing_outcome as enum ('interested', 'not_interested', 'offer_made');

create table public.viewings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  lead_id      uuid not null,
  property_id  uuid not null,
  scheduled_at timestamptz not null,
  status       public.viewing_status not null default 'scheduled',
  outcome      public.viewing_outcome,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (lead_id, org_id)     references public.leads (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  -- een uitkomst hoort alleen bij een bezichtiging die echt heeft plaatsgevonden
  check (outcome is null or status = 'done')
);
create index viewings_org_time_idx  on public.viewings (org_id, scheduled_at);
create index viewings_lead_idx      on public.viewings (lead_id);
create index viewings_property_idx  on public.viewings (property_id);

comment on column public.viewings.outcome is 'Alleen als de bezichtiging is gedaan (status done).';

-- Lead en pand van een bezichtiging staan vast: een andere afspraak is een nieuwe bezichtiging.
create function public.viewings_fixed_links()
returns trigger language plpgsql as $$
begin
  if new.lead_id is distinct from old.lead_id or new.property_id is distinct from old.property_id then
    raise exception 'lead en pand van een bezichtiging kunnen niet gewijzigd worden' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger viewings_touch         before update on public.viewings
  for each row execute function public.touch_updated_at();
create trigger viewings_org_lock      before update on public.viewings
  for each row execute function public.forbid_org_change();
create trigger viewings_fixed_links   before update on public.viewings
  for each row execute function public.viewings_fixed_links();
create trigger viewings_created_by    before insert on public.viewings
  for each row execute function public.set_created_by();

alter table public.viewings enable row level security;

create policy viewings_select on public.viewings
  for select to authenticated using (public.is_member(org_id));
create policy viewings_insert on public.viewings
  for insert to authenticated with check (public.can_write(org_id));
create policy viewings_update on public.viewings
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.viewings from anon, authenticated;
grant select on public.viewings to authenticated;
grant insert, update on public.viewings to authenticated;

-- ---------------------------------------------------------------------------
-- Team
-- ---------------------------------------------------------------------------

-- Leden van een kantoor met e-mailadres (auth.users is niet rechtstreeks leesbaar voor de app).
-- Alle leden mogen de lijst zien; wijzigen mogen alleen eigenaar en manager.
create function public.list_members(p_org uuid)
returns table (user_id uuid, email text, role public.org_role, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by m.created_at, u.email;
end $$;

-- Een lid verwijderen (of zelf het kantoor verlaten). Het account zelf blijft bestaan.
--  * eigenaar en manager mogen leden verwijderen, een manager geen eigenaar
--  * ieder lid mag zichzelf verwijderen
--  * de laatste eigenaar kan nooit verwijderd worden
create function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller public.org_role;
  v_target public.org_role;
begin
  v_caller := public.my_role(p_org);
  if v_caller is null then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  if p_user is distinct from auth.uid() and v_caller not in ('owner', 'manager') then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;

  select role into v_target from public.memberships where org_id = p_org and user_id = p_user;
  if v_target is null then
    raise exception 'lid_niet_gevonden' using errcode = 'P0002';
  end if;
  if v_target = 'owner' then
    if p_user is distinct from auth.uid() and v_caller <> 'owner' then
      raise exception 'alleen_eigenaar_mag_eigenaar_verwijderen' using errcode = '42501';
    end if;
    if (select count(*) from public.memberships where org_id = p_org and role = 'owner') = 1 then
      raise exception 'laatste_eigenaar' using errcode = '23514';
    end if;
  end if;

  delete from public.memberships where org_id = p_org and user_id = p_user;
end $$;

revoke all on function public.list_members(uuid), public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.list_members(uuid), public.remove_member(uuid, uuid) to authenticated;

revoke all on function public.viewings_fixed_links() from public, anon, authenticated;
