-- Amplify Vastgoed, etappe 1a: databasekern
--
-- Ontwerpkeuzes:
--  * Tenant = organisatie (kantoor of zelfstandige bemiddelaar). Elke rij hoort bij precies een organisatie.
--  * Rijen verwijzen naar elkaar via samengestelde foreign keys (id, org_id): een rij van organisatie A
--    kan nooit naar een rij van organisatie B verwijzen.
--  * Bedragen in centimes (gehele getallen). Valuta standaard MAD.
--  * Panden worden nooit verwijderd (status 'withdrawn' gebruiken). Alle belangrijke wijzigingen komen
--    in een onveranderlijke geschiedenis.
--  * Delen tussen organisaties (Amplify Network) bestaat bewust nog niet. Dat krijgt later een eigen
--    toestemmingsmodel; tot dan ziet elke organisatie uitsluitend haar eigen gegevens.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role       as enum ('owner', 'manager', 'agent', 'viewer');
create type public.property_type  as enum ('apartment', 'villa', 'riad', 'house', 'land', 'shop', 'office', 'building', 'other');
create type public.deal_purpose   as enum ('sale', 'rent_long', 'rent_short');
create type public.property_status as enum ('draft', 'available', 'reserved', 'rented', 'sold', 'withdrawn');
create type public.party_role     as enum ('owner', 'representative', 'tenant', 'buyer', 'contact');
create type public.mandate_basis  as enum ('written', 'verbal', 'owner_self', 'unverified');
create type public.mandate_status as enum ('active', 'expired', 'revoked');

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  city       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id     uuid not null references public.organizations(id),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.people (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  full_name  text not null check (char_length(full_name) between 1 and 200),
  phone      text,
  whatsapp   text,
  email      text,
  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index people_org_name_idx on public.people (org_id, lower(full_name));

create table public.properties (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  reference         text not null default ('P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  title             text not null check (char_length(title) between 1 and 200),
  property_type     public.property_type not null default 'apartment',
  purpose           public.deal_purpose not null,
  status            public.property_status not null default 'draft',
  price_cents       bigint check (price_cents is null or price_cents >= 0),
  currency          char(3) not null default 'MAD',
  city              text,
  neighborhood      text,
  address_note      text,
  bedrooms          smallint check (bedrooms is null or bedrooms >= 0),
  bathrooms         smallint check (bathrooms is null or bathrooms >= 0),
  area_m2           numeric(8,2) check (area_m2 is null or area_m2 > 0),
  furnished         boolean,
  description       text,
  info_confirmed_at timestamptz default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, reference)
);
create index properties_org_status_idx  on public.properties (org_id, status);
create index properties_org_created_idx on public.properties (org_id, created_at desc);

comment on column public.properties.price_cents is
  'In centimes. sale = totaalprijs, rent_long = per maand, rent_short = per nacht.';
comment on column public.properties.info_confirmed_at is
  'Laatste moment waarop prijs en beschikbaarheid bevestigd zijn (zie confirm_property_info).';

-- Wie is betrokken bij een pand (eigenaar, vertegenwoordiger, huurder, koper, contact)
create table public.property_parties (
  org_id      uuid not null,
  property_id uuid not null,
  person_id   uuid not null,
  role        public.party_role not null,
  created_at  timestamptz not null default now(),
  primary key (property_id, person_id, role),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  foreign key (person_id, org_id)   references public.people (id, org_id)
);
create index property_parties_person_idx on public.property_parties (person_id);

-- Op grond waarvan mag deze organisatie het pand aanbieden?
create table public.property_mandates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  property_id     uuid not null,
  owner_person_id uuid,
  basis           public.mandate_basis not null default 'unverified',
  status          public.mandate_status not null default 'active',
  valid_from      date,
  valid_until     date,
  evidence_note   text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  foreign key (property_id, org_id)     references public.properties (id, org_id),
  foreign key (owner_person_id, org_id) references public.people (id, org_id),
  check (valid_from is null or valid_until is null or valid_until >= valid_from),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index property_mandates_property_idx on public.property_mandates (property_id);

-- Onveranderlijke geschiedenis van belangrijke wijzigingen aan een pand
create table public.property_status_history (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  property_id uuid not null,
  changed_by  uuid,
  changed_at  timestamptz not null default clock_timestamp(),
  field       text not null,
  old_value   text,
  new_value   text,
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index property_history_property_idx on public.property_status_history (property_id, changed_at);

-- ---------------------------------------------------------------------------
-- Hulpfuncties voor rechten (security definer, zodat RLS zichzelf niet in de weg zit)
-- ---------------------------------------------------------------------------
create function public.my_role(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships where org_id = p_org and user_id = auth.uid()
$$;

create function public.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid())
$$;

-- eigenaar, manager en agent mogen gegevens aanmaken en wijzigen; viewer alleen lezen
create function public.can_write(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'manager', 'agent')
  )
$$;

-- eigenaar en manager beheren leden en instellingen
create function public.can_manage(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'manager')
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.forbid_org_change()
returns trigger language plpgsql as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id mag niet gewijzigd worden' using errcode = '23514';
  end if;
  return new;
end $$;

-- created_by kan niet vervalst worden door de browser
create function public.set_created_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create function public.set_revoked_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'revoked' and (tg_op = 'INSERT' or old.status <> 'revoked') then
    new.revoked_at := now();
  end if;
  return new;
end $$;

create function public.log_property_changes()
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
  return new;
end $$;

create function public.history_is_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'property_status_history is onveranderlijk' using errcode = '23514';
end $$;

create trigger people_touch      before update on public.people
  for each row execute function public.touch_updated_at();
create trigger properties_touch  before update on public.properties
  for each row execute function public.touch_updated_at();

create trigger people_org_lock     before update on public.people
  for each row execute function public.forbid_org_change();
create trigger properties_org_lock before update on public.properties
  for each row execute function public.forbid_org_change();
create trigger mandates_org_lock   before update on public.property_mandates
  for each row execute function public.forbid_org_change();

create trigger people_created_by     before insert on public.people
  for each row execute function public.set_created_by();
create trigger properties_created_by before insert on public.properties
  for each row execute function public.set_created_by();
create trigger mandates_created_by   before insert on public.property_mandates
  for each row execute function public.set_created_by();

create trigger mandates_revoked_at before insert or update on public.property_mandates
  for each row execute function public.set_revoked_at();

create trigger properties_history after insert or update on public.properties
  for each row execute function public.log_property_changes();

create trigger history_no_update before update or delete on public.property_status_history
  for each row execute function public.history_is_immutable();
create trigger history_no_truncate before truncate on public.property_status_history
  for each statement execute function public.history_is_immutable();

-- ---------------------------------------------------------------------------
-- Functies die de app aanroept
-- ---------------------------------------------------------------------------
create function public.create_organization(p_name text, p_slug text, p_city text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'niet_ingelogd' using errcode = '42501';
  end if;
  insert into public.organizations (name, slug, city)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(coalesce(p_city, '')), ''))
  returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end $$;

create function public.add_member(p_org uuid, p_email text, p_role public.org_role)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller   public.org_role;
  v_uid      uuid;
  v_existing public.org_role;
begin
  v_caller := public.my_role(p_org);
  if v_caller is null or v_caller not in ('owner', 'manager') then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  if p_role = 'owner' and v_caller <> 'owner' then
    raise exception 'alleen_eigenaar_mag_eigenaar_toevoegen' using errcode = '42501';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'gebruiker_niet_gevonden' using errcode = 'P0002';
  end if;

  select role into v_existing from public.memberships where org_id = p_org and user_id = v_uid;
  if v_existing = 'owner' and v_caller <> 'owner' then
    raise exception 'alleen_eigenaar_mag_eigenaar_wijzigen' using errcode = '42501';
  end if;
  if v_existing = 'owner' and p_role <> 'owner'
     and (select count(*) from public.memberships where org_id = p_org and role = 'owner') = 1 then
    raise exception 'laatste_eigenaar' using errcode = '23514';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (p_org, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
end $$;

-- "Prijs en beschikbaarheid zijn zojuist bevestigd" (komt in de geschiedenis)
create function public.confirm_property_info(p_property uuid)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.properties set info_confirmed_at = clock_timestamp() where id = p_property;
  if not found then
    raise exception 'pand_niet_gevonden' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.organizations           enable row level security;
alter table public.memberships             enable row level security;
alter table public.people                  enable row level security;
alter table public.properties              enable row level security;
alter table public.property_parties        enable row level security;
alter table public.property_mandates       enable row level security;
alter table public.property_status_history enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated using (public.is_member(id));
create policy organizations_update on public.organizations
  for update to authenticated using (public.can_manage(id)) with check (public.can_manage(id));

create policy memberships_select on public.memberships
  for select to authenticated using (public.is_member(org_id));

create policy people_select on public.people
  for select to authenticated using (public.is_member(org_id));
create policy people_insert on public.people
  for insert to authenticated with check (public.can_write(org_id));
create policy people_update on public.people
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy people_delete on public.people
  for delete to authenticated using (public.can_manage(org_id));

create policy properties_select on public.properties
  for select to authenticated using (public.is_member(org_id));
create policy properties_insert on public.properties
  for insert to authenticated with check (public.can_write(org_id));
create policy properties_update on public.properties
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

create policy parties_select on public.property_parties
  for select to authenticated using (public.is_member(org_id));
create policy parties_insert on public.property_parties
  for insert to authenticated with check (public.can_write(org_id));
create policy parties_delete on public.property_parties
  for delete to authenticated using (public.can_write(org_id));

create policy mandates_select on public.property_mandates
  for select to authenticated using (public.is_member(org_id));
create policy mandates_insert on public.property_mandates
  for insert to authenticated with check (public.can_write(org_id));
create policy mandates_update on public.property_mandates
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

create policy history_select on public.property_status_history
  for select to authenticated using (public.is_member(org_id));

-- ---------------------------------------------------------------------------
-- Rechten: standaard niets, daarna precies wat nodig is. Anonieme bezoekers hebben geen tabelrechten.
-- ---------------------------------------------------------------------------
revoke all on table
  public.organizations, public.memberships, public.people, public.properties,
  public.property_parties, public.property_mandates, public.property_status_history
from anon, authenticated;

grant select on
  public.organizations, public.memberships, public.people, public.properties,
  public.property_parties, public.property_mandates, public.property_status_history
to authenticated;

grant update (name, city) on public.organizations to authenticated;
grant insert, update, delete on public.people to authenticated;
grant insert, update on public.properties to authenticated;
grant insert, delete on public.property_parties to authenticated;
grant insert, update on public.property_mandates to authenticated;

revoke all on function
  public.my_role(uuid), public.is_member(uuid), public.can_write(uuid), public.can_manage(uuid),
  public.create_organization(text, text, text), public.add_member(uuid, text, public.org_role),
  public.confirm_property_info(uuid)
from public, anon;

grant execute on function
  public.my_role(uuid), public.is_member(uuid), public.can_write(uuid), public.can_manage(uuid),
  public.create_organization(text, text, text), public.add_member(uuid, text, public.org_role),
  public.confirm_property_info(uuid)
to authenticated;

revoke all on function
  public.touch_updated_at(), public.forbid_org_change(), public.set_created_by(),
  public.set_revoked_at(), public.log_property_changes(), public.history_is_immutable()
from public, anon, authenticated;
