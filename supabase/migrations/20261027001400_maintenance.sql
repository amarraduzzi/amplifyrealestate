-- Amplify Vastgoed, etappe 3c: onderhoud (meldingen per pand)
--
-- Een melding is iets wat stuk is of gedaan moet worden aan een pand: wie het meldde, wie het oplost, hoe dringend het is,
-- wat het kost en wie dat betaalt. Zelfde regels als de rest: elke rij hoort bij een organisatie, niets wordt verwijderd
-- (gebruik status 'cancelled'), verwijzen over organisaties heen kan niet, en na afloop van het plan is het alleen-lezen.
--
-- Ontwerpkeuzes:
--  * Het pand staat vast; een melding hoort bij een pand. Wie het meldde (bijvoorbeeld de huurder) en wie het oplost
--    (bijvoorbeeld een loodgieter) zijn personen uit de contacten van het kantoor, allebei optioneel.
--  * Status: open, in_progress, done of cancelled. done_on wordt automatisch gevuld bij done en weer leeg gemaakt als de melding heropend wordt.
--  * Kosten in centimes. cost_borne_by zegt wie ze betaalt: eigenaar, huurder of kantoor.

create type public.maintenance_priority as enum ('low', 'normal', 'urgent');
create type public.maintenance_status   as enum ('open', 'in_progress', 'done', 'cancelled');
create type public.maintenance_cost_by  as enum ('owner', 'tenant', 'agency');

create table public.maintenance_requests (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id),
  property_id            uuid not null,
  reported_by_person_id  uuid,
  assigned_person_id     uuid,
  title                  text not null check (char_length(trim(title)) between 3 and 200),
  description            text,
  priority               public.maintenance_priority not null default 'normal',
  status                 public.maintenance_status not null default 'open',
  reported_on            date not null default current_date,
  done_on                date,
  cost_cents             bigint check (cost_cents is null or cost_cents >= 0),
  cost_borne_by          public.maintenance_cost_by,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id)           references public.properties (id, org_id),
  foreign key (reported_by_person_id, org_id) references public.people (id, org_id),
  foreign key (assigned_person_id, org_id)    references public.people (id, org_id),
  check ((status = 'done') = (done_on is not null))
);
create index maintenance_org_status_idx on public.maintenance_requests (org_id, status);
create index maintenance_property_idx   on public.maintenance_requests (property_id);

comment on column public.maintenance_requests.cost_cents is 'In centimes: wat het herstel kost.';

-- Het pand staat vast
create function public.maintenance_fixed_property()
returns trigger language plpgsql as $$
begin
  if new.property_id is distinct from old.property_id then
    raise exception 'het pand van een onderhoudsmelding kan niet gewijzigd worden' using errcode = '23514';
  end if;
  return new;
end $$;

-- done_on volgt de status
create function public.maintenance_set_done()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.done_on := coalesce(new.done_on, current_date);
    else
      new.done_on := coalesce(new.done_on, old.done_on);
    end if;
  else
    new.done_on := null;
  end if;
  return new;
end $$;

create trigger maintenance_touch          before update on public.maintenance_requests
  for each row execute function public.touch_updated_at();
create trigger maintenance_org_lock       before update on public.maintenance_requests
  for each row execute function public.forbid_org_change();
create trigger maintenance_fixed_property before update on public.maintenance_requests
  for each row execute function public.maintenance_fixed_property();
create trigger maintenance_set_done       before insert or update on public.maintenance_requests
  for each row execute function public.maintenance_set_done();
create trigger maintenance_created_by     before insert on public.maintenance_requests
  for each row execute function public.set_created_by();

alter table public.maintenance_requests enable row level security;

create policy maintenance_select on public.maintenance_requests
  for select to authenticated using (public.is_member(org_id));
create policy maintenance_insert on public.maintenance_requests
  for insert to authenticated with check (public.can_write(org_id));
create policy maintenance_update on public.maintenance_requests
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.maintenance_requests from anon, authenticated;
grant select on public.maintenance_requests to authenticated;
grant insert, update on public.maintenance_requests to authenticated;

revoke all on function public.maintenance_fixed_property(), public.maintenance_set_done()
  from public, anon, authenticated;
