-- Amplify Vastgoed, etappe 4b: commissie delen met een andere makelaar
--
-- Een deal heeft een commissiebedrag voor het kantoor (deals.commission_cents). Werkt het kantoor samen met een
-- andere makelaar of tipgever, dan legt deal_splits vast welk percentage van die commissie naar die persoon gaat.
-- Wat overblijft is het deel van het eigen kantoor.
--
-- Dit is een administratie van wat jullie hebben afgesproken, geen contract: de afspraak zelf hoort op papier of in
-- een bericht te staan (veld agreement_note). Het bedrag wordt berekend uit het percentage; pas bij "betaald" wordt
-- het werkelijk betaalde bedrag vastgezet, zodat later wijzigen van de commissie een betaalde regel niet verandert.
-- Samenwerking tussen kantoren in de app (Amplify Network) bestaat nog niet: de andere makelaar is hier een persoon
-- uit "people", eventueel met de naam van zijn kantoor.

create type public.split_kind   as enum ('co_agent', 'referrer', 'other');
create type public.split_status as enum ('agreed', 'paid');

create table public.deal_splits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  deal_id        uuid not null,
  person_id      uuid not null,
  agency_name    text check (agency_name is null or char_length(trim(agency_name)) between 2 and 200),
  kind           public.split_kind not null default 'co_agent',
  share_pct      numeric(5,2) not null check (share_pct > 0 and share_pct <= 100),
  status         public.split_status not null default 'agreed',
  paid_on        date,
  paid_cents     bigint check (paid_cents is null or paid_cents >= 0),
  agreement_note text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id),
  unique (deal_id, person_id),
  foreign key (deal_id, org_id)   references public.deals (id, org_id),
  foreign key (person_id, org_id) references public.people (id, org_id),
  check ((status = 'paid') = (paid_on is not null and paid_cents is not null)),
  check ((paid_on is null) = (paid_cents is null))
);
create index deal_splits_org_idx  on public.deal_splits (org_id);
create index deal_splits_deal_idx on public.deal_splits (deal_id);

comment on column public.deal_splits.share_pct      is 'Percentage van de commissie van het kantoor (deals.commission_cents) dat naar deze persoon gaat.';
comment on column public.deal_splits.paid_cents     is 'In centimes: wat werkelijk betaald is. Wordt bij "paid" vastgezet uit commissie x percentage.';
comment on column public.deal_splits.agreement_note is 'Hoe is het afgesproken? Bijvoorbeeld: ondertekend papier in het dossier, of WhatsApp van 12 oktober.';

-- Deal, persoon en kantoor liggen vast; een betaalde regel verandert niet van percentage of persoon.
create function public.deal_splits_fixed()
returns trigger language plpgsql as $$
begin
  if new.deal_id is distinct from old.deal_id or new.person_id is distinct from old.person_id then
    raise exception 'deal en persoon van een verdeling kunnen niet gewijzigd worden' using errcode = '23514';
  end if;
  if old.status = 'paid' and new.status = 'paid' and new.share_pct is distinct from old.share_pct then
    raise exception 'een betaalde verdeling kan niet meer van percentage veranderen' using errcode = '23514';
  end if;
  return new;
end $$;

-- Betaald: datum en bedrag worden vastgezet. Zonder commissiebedrag op de deal kan er niets betaald worden.
create function public.deal_splits_set_paid()
returns trigger language plpgsql as $$
declare
  v_commission bigint;
begin
  if new.status = 'paid' then
    if tg_op = 'INSERT' or old.status <> 'paid' then
      select d.commission_cents into v_commission from public.deals d where d.id = new.deal_id;
      if v_commission is null then
        raise exception 'geen_commissiebedrag' using errcode = '23514';
      end if;
      new.paid_on    := coalesce(new.paid_on, current_date);
      new.paid_cents := coalesce(new.paid_cents, round(v_commission * new.share_pct / 100)::bigint);
    else
      new.paid_on    := old.paid_on;
      new.paid_cents := old.paid_cents;
    end if;
  else
    new.paid_on    := null;
    new.paid_cents := null;
  end if;
  return new;
end $$;

-- Samen mogen de verdelingen van een deal nooit boven 100% uitkomen. De deal wordt even vergrendeld,
-- zodat twee collega's tegelijk niet samen over de grens kunnen gaan.
create function public.deal_splits_check_total()
returns trigger language plpgsql as $$
declare
  v_other numeric;
begin
  perform 1 from public.deals d where d.id = new.deal_id for update;
  select coalesce(sum(s.share_pct), 0) into v_other
    from public.deal_splits s where s.deal_id = new.deal_id and s.id <> new.id;
  if v_other + new.share_pct > 100 then
    raise exception 'verdeling_boven_100' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger deal_splits_touch      before update on public.deal_splits
  for each row execute function public.touch_updated_at();
create trigger deal_splits_org_lock   before update on public.deal_splits
  for each row execute function public.forbid_org_change();
create trigger deal_splits_fixed      before update on public.deal_splits
  for each row execute function public.deal_splits_fixed();
create trigger deal_splits_set_paid   before insert or update on public.deal_splits
  for each row execute function public.deal_splits_set_paid();
create trigger deal_splits_total      before insert or update of share_pct on public.deal_splits
  for each row execute function public.deal_splits_check_total();
create trigger deal_splits_created_by before insert on public.deal_splits
  for each row execute function public.set_created_by();

-- Row level security: zelfde model als deals. Een regel die nog niet betaald is mag weg (verkeerd ingevoerd);
-- een betaalde regel blijft staan als administratie.
alter table public.deal_splits enable row level security;

create policy deal_splits_select on public.deal_splits
  for select to authenticated using (public.is_member(org_id));
create policy deal_splits_insert on public.deal_splits
  for insert to authenticated with check (public.can_write(org_id));
create policy deal_splits_update on public.deal_splits
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy deal_splits_delete on public.deal_splits
  for delete to authenticated using (public.can_write(org_id) and status = 'agreed');

revoke all on table public.deal_splits from anon, authenticated;
grant select on public.deal_splits to authenticated;
grant insert, update, delete on public.deal_splits to authenticated;

revoke all on function public.deal_splits_fixed(), public.deal_splits_set_paid(), public.deal_splits_check_total()
  from public, anon, authenticated;
