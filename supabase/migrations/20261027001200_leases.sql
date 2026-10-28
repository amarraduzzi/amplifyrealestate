-- Amplify Vastgoed, etappe 3a: huurovereenkomsten (lopende huur per pand)
--
-- Een huurovereenkomst koppelt een huurder (persoon) aan een pand met een maandhuur, een borg, een startdatum
-- en eventueel een einddatum. Dit is de basis voor etappe 3: huurbetalingen en onderhoud komen hierop.
-- Zelfde regels als de rest: elke rij hoort bij een organisatie, geen verwijderen (status 'ended' gebruiken),
-- verwijzen over organisaties heen kan niet, en na afloop van het plan is het alleen-lezen (can_write).
--
-- Ontwerpkeuzes:
--  * Alleen panden met doel huur (lang of kort) kunnen verhuurd worden; een koopwoning geeft een fout.
--  * Per pand is er maximaal een lopende (active) overeenkomst.
--  * Een nieuwe lopende overeenkomst zet een beschikbaar of gereserveerd pand op 'rented'. Beeindig je de
--    overeenkomst, dan gaat een verhuurd pand terug naar 'available'. Pas de status daarna zelf aan als dat niet klopt
--    (bijvoorbeeld 'withdrawn').
--  * Pand en huurder staan vast; een andere huurder is een nieuwe overeenkomst.
--  * Bedragen in centimes, zoals overal. De huur is per maand (ook bij korte verhuur is dit het afgesproken maandbedrag).
--  * payment_day (1 t/m 28) is de dag van de maand waarop de huur betaald moet zijn; dit gebruiken de betalingen in 3b.

create type public.lease_status as enum ('active', 'ended');

create table public.leases (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  property_id      uuid not null,
  tenant_person_id uuid not null,
  status           public.lease_status not null default 'active',
  rent_cents       bigint not null check (rent_cents > 0),
  deposit_cents    bigint check (deposit_cents is null or deposit_cents >= 0),
  start_date       date not null,
  end_date         date,
  payment_day      smallint not null default 1 check (payment_day between 1 and 28),
  ended_on         date,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id)      references public.properties (id, org_id),
  foreign key (tenant_person_id, org_id) references public.people (id, org_id),
  check (end_date is null or end_date >= start_date),
  check ((status = 'ended') = (ended_on is not null))
);
create index leases_org_status_idx on public.leases (org_id, status);
create index leases_property_idx   on public.leases (property_id);
create index leases_tenant_idx     on public.leases (tenant_person_id);
create unique index leases_one_active_idx on public.leases (property_id) where status = 'active';

comment on column public.leases.rent_cents is 'In centimes: de huur per maand.';
comment on column public.leases.payment_day is 'Dag van de maand (1 t/m 28) waarop de huur betaald moet zijn.';

-- Alleen huurpanden
create function public.leases_check_property()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_purpose public.deal_purpose;
begin
  select purpose into v_purpose from public.properties where id = new.property_id;
  if v_purpose = 'sale' then
    raise exception 'pand_is_geen_huurpand' using errcode = '23514';
  end if;
  return new;
end $$;

-- Pand en huurder staan vast
create function public.leases_fixed_links()
returns trigger language plpgsql as $$
begin
  if new.property_id is distinct from old.property_id or new.tenant_person_id is distinct from old.tenant_person_id then
    raise exception 'pand en huurder van een huurovereenkomst kunnen niet gewijzigd worden' using errcode = '23514';
  end if;
  return new;
end $$;

-- ended_on volgt de status: gevuld zodra de overeenkomst eindigt, leeg als hij weer loopt
create function public.leases_set_ended()
returns trigger language plpgsql as $$
begin
  if new.status = 'ended' then
    if tg_op = 'INSERT' or old.status <> 'ended' then
      new.ended_on := coalesce(new.ended_on, current_date);
    else
      new.ended_on := coalesce(new.ended_on, old.ended_on);
    end if;
  else
    new.ended_on := null;
  end if;
  return new;
end $$;

-- Gevolgen voor het pand (security definer: de gebruiker mag via de overeenkomst de status van het pand aanpassen)
create function public.leases_apply_effects()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  if new.status = 'active' then
    update public.properties set status = 'rented' where id = new.property_id and status in ('available', 'reserved');
  else
    update public.properties set status = 'available' where id = new.property_id and status = 'rented';
  end if;
  return null;
end $$;

create trigger leases_check_property before insert on public.leases
  for each row execute function public.leases_check_property();
create trigger leases_touch        before update on public.leases
  for each row execute function public.touch_updated_at();
create trigger leases_org_lock     before update on public.leases
  for each row execute function public.forbid_org_change();
create trigger leases_fixed_links  before update on public.leases
  for each row execute function public.leases_fixed_links();
create trigger leases_set_ended    before insert or update on public.leases
  for each row execute function public.leases_set_ended();
create trigger leases_created_by   before insert on public.leases
  for each row execute function public.set_created_by();
create trigger leases_effects      after insert or update of status on public.leases
  for each row execute function public.leases_apply_effects();

alter table public.leases enable row level security;

create policy leases_select on public.leases
  for select to authenticated using (public.is_member(org_id));
create policy leases_insert on public.leases
  for insert to authenticated with check (public.can_write(org_id));
create policy leases_update on public.leases
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.leases from anon, authenticated;
grant select on public.leases to authenticated;
grant insert, update on public.leases to authenticated;

revoke all on function public.leases_check_property(), public.leases_fixed_links(), public.leases_set_ended(), public.leases_apply_effects()
  from public, anon, authenticated;
