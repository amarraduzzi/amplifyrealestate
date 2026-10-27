-- Amplify Vastgoed, etappe 2a: deals (transacties) met commissie
--
-- Een deal is een afspraak tussen een lead en een pand over een prijs, met een commissie voor het kantoor.
-- Voortgang: offer (bod) -> accepted (akkoord) -> signed (getekend) -> paid (commissie ontvangen), of lost (niet doorgegaan).
-- Zelfde regels als de rest: elke rij hoort bij een organisatie, geen verwijderen (stage 'lost' gebruiken),
-- verwijzen over organisaties heen kan niet, en na afloop van het plan is het alleen-lezen (can_write).
--
-- Automatisch bij een nieuwe fase (de app hoeft niets extra's te doen):
--  * accepted: een beschikbaar pand wordt gereserveerd.
--  * signed of paid: het pand wordt verkocht (sale) of verhuurd (huur), en de lead wordt 'won'.
--  * lost na accepted: het pand wordt weer beschikbaar, tenzij er een andere deal in akkoord is.
-- Een fase terugzetten (bijvoorbeeld van signed naar accepted) zet de status van het pand niet terug: pas die zelf aan.
-- Per lead en pand is er maximaal een lopende deal (niet lost).

create type public.deal_stage as enum ('offer', 'accepted', 'signed', 'paid', 'lost');

create table public.deals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  lead_id          uuid not null,
  property_id      uuid not null,
  stage            public.deal_stage not null default 'offer',
  price_cents      bigint not null check (price_cents > 0),
  commission_pct   numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  commission_cents bigint check (commission_cents is null or commission_cents >= 0),
  notes            text,
  lost_reason      text,
  stage_changed_at timestamptz not null default now(),
  signed_at        timestamptz,
  paid_at          timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (lead_id, org_id)     references public.leads (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index deals_org_stage_idx on public.deals (org_id, stage);
create index deals_lead_idx      on public.deals (lead_id);
create index deals_property_idx  on public.deals (property_id);
create unique index deals_open_idx on public.deals (lead_id, property_id) where stage <> 'lost';

comment on column public.deals.price_cents is 'In centimes: totaalprijs bij koop, per maand of per nacht bij huur, net als properties.price_cents.';
comment on column public.deals.commission_cents is 'In centimes: het afgesproken bedrag voor het kantoor. commission_pct is alleen de reden achter dat bedrag.';

-- Lead en pand van een deal staan vast; een andere combinatie is een nieuwe deal.
create function public.deals_fixed_links()
returns trigger language plpgsql as $$
begin
  if new.lead_id is distinct from old.lead_id or new.property_id is distinct from old.property_id then
    raise exception 'lead en pand van een deal kunnen niet gewijzigd worden' using errcode = '23514';
  end if;
  return new;
end $$;

-- Tijdstippen bij een nieuwe fase
create function public.deals_stage_times()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := clock_timestamp();
    if new.stage in ('signed', 'paid') and new.signed_at is null then new.signed_at := clock_timestamp(); end if;
    if new.stage = 'paid' and new.paid_at is null then new.paid_at := clock_timestamp(); end if;
    if new.stage <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end $$;

-- Gevolgen voor pand en lead (security definer: de gebruiker mag via de deal het pand aanpassen)
create function public.deals_apply_effects()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_purpose public.deal_purpose;
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then
    return null;
  end if;

  if new.stage = 'accepted' then
    update public.properties set status = 'reserved' where id = new.property_id and status = 'available';

  elsif new.stage in ('signed', 'paid') then
    select purpose into v_purpose from public.properties where id = new.property_id;
    update public.properties
       set status = case when v_purpose = 'sale' then 'sold'::public.property_status else 'rented'::public.property_status end
     where id = new.property_id and status in ('available', 'reserved');
    update public.leads set status = 'won' where id = new.lead_id and status <> 'won';

  elsif new.stage = 'lost' and tg_op = 'UPDATE' and old.stage = 'accepted' then
    if not exists (select 1 from public.deals d where d.property_id = new.property_id and d.id <> new.id and d.stage = 'accepted') then
      update public.properties set status = 'available' where id = new.property_id and status = 'reserved';
    end if;
  end if;
  return null;
end $$;

create trigger deals_touch        before update on public.deals
  for each row execute function public.touch_updated_at();
create trigger deals_org_lock     before update on public.deals
  for each row execute function public.forbid_org_change();
create trigger deals_fixed_links  before update on public.deals
  for each row execute function public.deals_fixed_links();
create trigger deals_stage_times  before update on public.deals
  for each row execute function public.deals_stage_times();
create trigger deals_created_by   before insert on public.deals
  for each row execute function public.set_created_by();
create trigger deals_effects      after insert or update of stage on public.deals
  for each row execute function public.deals_apply_effects();

alter table public.deals enable row level security;

create policy deals_select on public.deals
  for select to authenticated using (public.is_member(org_id));
create policy deals_insert on public.deals
  for insert to authenticated with check (public.can_write(org_id));
create policy deals_update on public.deals
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.deals from anon, authenticated;
grant select on public.deals to authenticated;
grant insert, update on public.deals to authenticated;

revoke all on function public.deals_fixed_links(), public.deals_stage_times(), public.deals_apply_effects()
  from public, anon, authenticated;
