-- Amplify Vastgoed, etappe 10a: promoteurs (projecten, tranches en voorraad per kavel)
--
-- Een promoteur (of een kantoor dat een project commercialiseert) beheert:
--  * dev_projects: het project (naam, stad, adres, status, verwachte oplevering);
--  * dev_tranches: de fases van het project (tranche 1, tranche 2, ...), elk met een eigen oplevering;
--  * dev_units: de kavels in voorraad (appartement, villa, winkel, parking, kavel grond, ...) met gebouw, verdieping,
--    oppervlakte, prijs en status (vrij, optie, gereserveerd, verkocht, geblokkeerd).
--
-- Regels:
--  * Bedragen in centimes. Referentie van een kavel is uniek binnen het project.
--  * add_dev_units maakt in een keer een hele reeks kavels (gebouw A, verdieping 1 tot 5, 4 per verdieping): max 500.
--  * Een verkochte kavel ligt vast: prijs, status en koper wijzigen kan dan alleen door eigenaar of manager.
--    Dat voorkomt dat een verkoop per ongeluk weer als vrij in de lijst staat.
--  * Aanmaken en wijzigen: eigenaar, manager en agent (can_write). Viewers zien alles behalve de koper.

create type public.dev_project_status as enum ('planning', 'selling', 'construction', 'delivered');
create type public.dev_unit_kind as enum ('apartment', 'villa', 'duplex', 'studio', 'shop', 'office', 'parking', 'storage', 'plot', 'other');
create type public.dev_unit_status as enum ('available', 'option', 'reserved', 'sold', 'blocked');

create table public.dev_projects (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  name           text not null check (char_length(trim(name)) between 2 and 200),
  city           text check (city is null or char_length(city) <= 100),
  address        text check (address is null or char_length(address) <= 300),
  description    text check (description is null or char_length(description) <= 5000),
  status         public.dev_project_status not null default 'selling',
  delivery_date  date,
  archived       boolean not null default false,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id)
);
create index dev_projects_org_idx on public.dev_projects (org_id, name);

create table public.dev_tranches (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  project_id     uuid not null,
  name           text not null check (char_length(trim(name)) between 1 and 100),
  position       integer not null default 1,
  delivery_date  date,
  created_at     timestamptz not null default now(),
  unique (id, org_id),
  unique (project_id, name),
  foreign key (project_id, org_id) references public.dev_projects (id, org_id) on delete cascade
);

create table public.dev_units (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  project_id        uuid not null,
  tranche_id        uuid,
  reference         text not null check (char_length(trim(reference)) between 1 and 40),
  kind              public.dev_unit_kind not null default 'apartment',
  building          text check (building is null or char_length(building) <= 40),
  floor             integer check (floor is null or floor between -5 and 200),
  bedrooms          integer check (bedrooms is null or bedrooms between 0 and 50),
  area_m2           numeric(9,2) check (area_m2 is null or area_m2 > 0),
  terrace_m2        numeric(9,2) check (terrace_m2 is null or terrace_m2 >= 0),
  price_cents       bigint check (price_cents is null or price_cents > 0),
  status            public.dev_unit_status not null default 'available',
  buyer_person_id   uuid,
  notes             text check (notes is null or char_length(notes) <= 2000),
  status_changed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  unique (project_id, reference),
  foreign key (project_id, org_id) references public.dev_projects (id, org_id) on delete cascade,
  foreign key (tranche_id, org_id) references public.dev_tranches (id, org_id),
  foreign key (buyer_person_id, org_id) references public.people (id, org_id)
);
create index dev_units_project_idx on public.dev_units (project_id, building, floor, reference);

-- Een tranche weghalen laat de kavels staan (zonder tranche)
create function public.dev_tranche_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.dev_units set tranche_id = null where tranche_id = old.id;
  return old;
end $$;
create trigger dev_tranche_release before delete on public.dev_tranches for each row execute function public.dev_tranche_release();

create trigger dev_projects_touch    before update on public.dev_projects for each row execute function public.touch_updated_at();
create trigger dev_projects_org_lock before update on public.dev_projects for each row execute function public.forbid_org_change();
create trigger dev_projects_by       before insert on public.dev_projects for each row execute function public.set_created_by();
create trigger dev_tranches_org_lock before update on public.dev_tranches for each row execute function public.forbid_org_change();
create trigger dev_units_touch       before update on public.dev_units for each row execute function public.touch_updated_at();
create trigger dev_units_org_lock    before update on public.dev_units for each row execute function public.forbid_org_change();

-- Statusdatum bijhouden; verkochte kavels alleen door eigenaar of manager wijzigen; tranche moet bij het project horen
create function public.dev_units_guard()
returns trigger language plpgsql as $$
begin
  if new.tranche_id is not null and not exists (select 1 from public.dev_tranches where id = new.tranche_id and project_id = new.project_id) then
    raise exception 'unit_tranche_other_project' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'unit_project_fixed' using errcode = '23514';
    end if;
    if old.status = 'sold' and (new.status <> old.status or new.price_cents is distinct from old.price_cents
        or new.buyer_person_id is distinct from old.buyer_person_id) and not public.can_manage(old.org_id) then
      raise exception 'unit_sold_locked' using errcode = '42501';
    end if;
    if new.status <> old.status then new.status_changed_at := now(); end if;
  end if;
  return new;
end $$;
create trigger dev_units_guard before insert or update on public.dev_units for each row execute function public.dev_units_guard();

-- Een reeks kavels in een keer: gebouw, verdieping van/tot, aantal per verdieping. Referentie: <gebouw>-<verdieping><nr>,
-- bijvoorbeeld A-101, A-102 (verdieping 0 = rez-de-chaussée: A-001). Geeft het aantal gemaakte kavels terug.
create function public.add_dev_units(p_project uuid, p_tranche uuid, p_building text, p_floor_from integer, p_floor_to integer,
  p_per_floor integer, p_kind public.dev_unit_kind default 'apartment', p_bedrooms integer default null,
  p_area numeric default null, p_price_cents bigint default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  pr   public.dev_projects;
  b    text := nullif(trim(coalesce(p_building, '')), '');
  f    integer;
  n    integer;
  ref  text;
  cnt  integer := 0;
begin
  select * into pr from public.dev_projects where id = p_project;
  if pr.id is not null and public.is_member(pr.org_id) and not public.org_is_open(pr.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if pr.id is null or not public.can_write(pr.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if p_floor_from is null or p_floor_to is null or p_per_floor is null or p_per_floor < 1 or p_per_floor > 99
     or p_floor_to < p_floor_from or p_floor_from < -5 or p_floor_to > 200 or char_length(coalesce(b, '')) > 20 then
    raise exception 'units_invalid' using errcode = '22023';
  end if;
  if (p_floor_to - p_floor_from + 1) * p_per_floor > 500 then
    raise exception 'units_too_many' using errcode = '22023';
  end if;
  for f in p_floor_from .. p_floor_to loop
    for n in 1 .. p_per_floor loop
      ref := coalesce(b || '-', '') || case when f < 0 then 'S' || abs(f)::text || lpad(n::text, 2, '0') else f::text || lpad(n::text, 2, '0') end;
      if f = 0 then ref := coalesce(b || '-', '') || '0' || lpad(n::text, 2, '0'); end if;
      if exists (select 1 from public.dev_units where project_id = pr.id and reference = ref) then
        raise exception 'unit_reference_taken' using errcode = '23505', detail = ref;
      end if;
      insert into public.dev_units (org_id, project_id, tranche_id, reference, kind, building, floor, bedrooms, area_m2, price_cents)
      values (pr.org_id, pr.id, p_tranche, ref, p_kind, b, f, p_bedrooms, p_area, p_price_cents);
      cnt := cnt + 1;
    end loop;
  end loop;
  return cnt;
end $$;

-- Koper alleen voor wie geen viewer is
create function public.dev_unit_buyers(p_project uuid)
returns table (unit_id uuid, buyer_person_id uuid, buyer_name text, buyer_phone text)
language sql stable security definer set search_path = public as $$
  select u.id, u.buyer_person_id, p.full_name, coalesce(p.whatsapp, p.phone)
  from public.dev_units u join public.people p on p.id = u.buyer_person_id
  where u.project_id = p_project and public.is_member(u.org_id) and public.my_role(u.org_id) <> 'viewer'
$$;

alter table public.dev_projects enable row level security;
alter table public.dev_tranches enable row level security;
alter table public.dev_units enable row level security;
create policy dev_projects_select on public.dev_projects for select to authenticated using (public.is_member(org_id));
create policy dev_projects_insert on public.dev_projects for insert to authenticated with check (public.can_write(org_id));
create policy dev_projects_update on public.dev_projects for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy dev_tranches_select on public.dev_tranches for select to authenticated using (public.is_member(org_id));
create policy dev_tranches_insert on public.dev_tranches for insert to authenticated with check (public.can_write(org_id));
create policy dev_tranches_update on public.dev_tranches for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy dev_tranches_delete on public.dev_tranches for delete to authenticated using (public.can_write(org_id));
create policy dev_units_select on public.dev_units for select to authenticated using (public.is_member(org_id));
create policy dev_units_insert on public.dev_units for insert to authenticated with check (public.can_write(org_id));
create policy dev_units_update on public.dev_units for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy dev_units_delete on public.dev_units for delete to authenticated using (public.can_write(org_id) and status <> 'sold');

revoke all on table public.dev_projects, public.dev_tranches, public.dev_units from anon, authenticated;
grant select on public.dev_projects, public.dev_tranches to authenticated;
grant select (id, org_id, project_id, tranche_id, reference, kind, building, floor, bedrooms, area_m2, terrace_m2, price_cents,
              status, notes, status_changed_at, created_at, updated_at) on public.dev_units to authenticated;
grant insert (org_id, name, city, address, description, status, delivery_date) on public.dev_projects to authenticated;
grant update (name, city, address, description, status, delivery_date, archived) on public.dev_projects to authenticated;
grant insert (org_id, project_id, name, position, delivery_date) on public.dev_tranches to authenticated;
grant update (name, position, delivery_date) on public.dev_tranches to authenticated;
grant delete on public.dev_tranches to authenticated;
grant insert (org_id, project_id, tranche_id, reference, kind, building, floor, bedrooms, area_m2, terrace_m2, price_cents, status, buyer_person_id, notes)
  on public.dev_units to authenticated;
grant update (tranche_id, reference, kind, building, floor, bedrooms, area_m2, terrace_m2, price_cents, status, buyer_person_id, notes)
  on public.dev_units to authenticated;
grant delete on public.dev_units to authenticated;

revoke all on function public.dev_tranche_release(), public.dev_units_guard() from public, anon, authenticated;
revoke all on function public.add_dev_units(uuid, uuid, text, integer, integer, integer, public.dev_unit_kind, integer, numeric, bigint),
  public.dev_unit_buyers(uuid) from public, anon;
grant execute on function public.add_dev_units(uuid, uuid, text, integer, integer, integer, public.dev_unit_kind, integer, numeric, bigint),
  public.dev_unit_buyers(uuid) to authenticated;
