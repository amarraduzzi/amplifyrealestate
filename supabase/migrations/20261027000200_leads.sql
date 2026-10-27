-- Amplify Vastgoed, etappe 1b-4: leads (geinteresseerden met een zoekopdracht)
--
-- Een lead is een persoon uit "people" met een zoekopdracht: kopen of huren, budget, type, wijk enzovoort.
-- Passende panden worden in de app berekend uit deze criteria; er wordt niets dubbel opgeslagen.
-- Zelfde regels als de rest: elke rij hoort bij een organisatie, geen verwijderen (status 'lost' gebruiken),
-- verwijzen over organisaties heen kan niet.

create type public.lead_status as enum ('new', 'active', 'viewing', 'won', 'lost');

create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  person_id        uuid not null,
  purpose          public.deal_purpose not null,
  status           public.lead_status not null default 'new',
  property_types   public.property_type[] not null default '{}',
  city             text,
  neighborhoods    text[] not null default '{}',
  budget_min_cents bigint check (budget_min_cents is null or budget_min_cents >= 0),
  budget_max_cents bigint check (budget_max_cents is null or budget_max_cents >= 0),
  min_bedrooms     smallint check (min_bedrooms is null or min_bedrooms >= 0),
  min_area_m2      numeric(8,2) check (min_area_m2 is null or min_area_m2 > 0),
  furnished        boolean,
  notes            text,
  last_contact_at  timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (person_id, org_id) references public.people (id, org_id),
  check (budget_min_cents is null or budget_max_cents is null or budget_max_cents >= budget_min_cents)
);
create index leads_org_status_idx  on public.leads (org_id, status);
create index leads_org_created_idx on public.leads (org_id, created_at desc);
create index leads_person_idx      on public.leads (person_id);

comment on column public.leads.budget_min_cents is
  'In centimes. Bij kopen het totaalbedrag, bij huur per maand (rent_long) of per nacht (rent_short), net als properties.price_cents.';
comment on column public.leads.property_types is 'Leeg = elk type.';
comment on column public.leads.neighborhoods  is 'Leeg = elke wijk.';

-- Hergebruik van de bestaande triggerfuncties uit etappe 1a
create trigger leads_touch      before update on public.leads
  for each row execute function public.touch_updated_at();
create trigger leads_org_lock   before update on public.leads
  for each row execute function public.forbid_org_change();
create trigger leads_created_by before insert on public.leads
  for each row execute function public.set_created_by();

-- "Ik heb deze persoon zojuist gesproken"
create function public.touch_lead_contact(p_lead uuid)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.leads set last_contact_at = clock_timestamp() where id = p_lead;
  if not found then
    raise exception 'lead_niet_gevonden' using errcode = 'P0002';
  end if;
end $$;

-- Row level security: zelfde model als panden
alter table public.leads enable row level security;

create policy leads_select on public.leads
  for select to authenticated using (public.is_member(org_id));
create policy leads_insert on public.leads
  for insert to authenticated with check (public.can_write(org_id));
create policy leads_update on public.leads
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.leads from anon, authenticated;
grant select on public.leads to authenticated;
grant insert, update on public.leads to authenticated;

revoke all on function public.touch_lead_contact(uuid) from public, anon;
grant execute on function public.touch_lead_contact(uuid) to authenticated;
