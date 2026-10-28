-- Amplify Vastgoed, etappe 10b: reservering, acompte en betalingsschema (VEFA, loi 44-00 gewijzigd door 107-12)
--
--  * dev_sales: de verkoop van een lot aan een koper: prijs, soort (VEFA of gewone reservering), status
--    (gereserveerd, getekend, opgeleverd, geannuleerd).
--  * dev_installments: het betalingsschema. Elke termijn hoort bij een mijlpaal (contract, fundering, ruwbouw,
--    afwerking, sleutels, akte) of heeft een eigen datum.
--  * Mijlpalen van de bouw: per project (en eventueel per tranche) de datum waarop fundering, ruwbouw, afwerking en
--    sleutels klaar zijn. Een termijn is opeisbaar zodra zijn mijlpaal een datum heeft.
--
-- Regels:
--  * Termijnen tellen precies op tot 100% en tot de prijs op de centime (de afrondingsrest gaat naar de laatste termijn).
--  * VEFA (loi 107-12): maximaal 5% bij het contrat préliminaire en minimaal 20% bij de sleuteloverdracht.
--  * create_dev_sale zet het lot op gereserveerd met de koper; sign_dev_sale zet het op verkocht; cancel_dev_sale zet
--    het lot weer vrij. Annuleren van een getekende verkoop kan alleen door eigenaar of manager.
--  * Bedragen in centimes. Viewers zien geen verkopen.

create type public.dev_sale_kind as enum ('vefa', 'reservation');
create type public.dev_sale_status as enum ('reserved', 'signed', 'delivered', 'cancelled');
create type public.dev_milestone as enum ('contract', 'foundations', 'structure', 'finishing', 'keys', 'deed', 'date');

alter table public.dev_projects
  add column foundations_on date, add column structure_on date, add column finishing_on date, add column keys_on date;
alter table public.dev_tranches
  add column foundations_on date, add column structure_on date, add column finishing_on date, add column keys_on date;
grant update (foundations_on, structure_on, finishing_on, keys_on) on public.dev_projects, public.dev_tranches to authenticated;

create table public.dev_sales (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  project_id       uuid not null,
  unit_id          uuid not null,
  buyer_person_id  uuid not null,
  kind             public.dev_sale_kind not null default 'vefa',
  status           public.dev_sale_status not null default 'reserved',
  price_cents      bigint not null check (price_cents > 0),
  reserved_on      date not null default current_date,
  signed_on        date,
  delivered_on     date,
  cancelled_on     date,
  notes            text check (notes is null or char_length(notes) <= 2000),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (project_id, org_id) references public.dev_projects (id, org_id),
  foreign key (unit_id, org_id) references public.dev_units (id, org_id),
  foreign key (buyer_person_id, org_id) references public.people (id, org_id)
);
-- Een lot heeft hoogstens een lopende verkoop
create unique index dev_sales_one_active on public.dev_sales (unit_id) where status <> 'cancelled';
create index dev_sales_project_idx on public.dev_sales (project_id, status);

create table public.dev_installments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  sale_id       uuid not null,
  position      integer not null,
  label         text not null check (char_length(trim(label)) between 1 and 120),
  milestone     public.dev_milestone not null,
  pct           numeric(6,3) not null check (pct > 0 and pct <= 100),
  amount_cents  bigint not null check (amount_cents >= 0),
  due_date      date,
  paid_cents    bigint not null default 0 check (paid_cents >= 0),
  paid_on       date,
  reminded_on   date,
  unique (sale_id, position),
  foreign key (sale_id, org_id) references public.dev_sales (id, org_id) on delete cascade,
  check (paid_cents <= amount_cents),
  check (milestone <> 'date' or due_date is not null)
);

create trigger dev_sales_touch    before update on public.dev_sales for each row execute function public.touch_updated_at();
create trigger dev_sales_org_lock before update on public.dev_sales for each row execute function public.forbid_org_change();

create function public.dev_installments_paid()
returns trigger language plpgsql as $$
begin
  if new.amount_cents <> old.amount_cents or new.pct <> old.pct or new.milestone <> old.milestone then
    raise exception 'installment_fixed' using errcode = '23514';
  end if;
  if new.paid_cents > 0 then new.paid_on := coalesce(new.paid_on, current_date); else new.paid_on := null; end if;
  return new;
end $$;
create trigger dev_installments_paid before update on public.dev_installments for each row execute function public.dev_installments_paid();

-- Een verkoop maken. p_schedule: [{"label": "...", "milestone": "contract", "pct": 5, "due_date": null}, ...]
create function public.create_dev_sale(p_unit uuid, p_buyer uuid, p_price_cents bigint, p_kind public.dev_sale_kind, p_schedule jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u       public.dev_units;
  v_id    uuid;
  v_sum   numeric := 0;
  v_pre   numeric := 0;
  v_keys  numeric := 0;
  v_ctr   numeric := 0;
  v_n     integer;
  v_left  bigint;
  v_amt   bigint;
  e       jsonb;
  i       integer := 0;
  m       public.dev_milestone;
begin
  select * into u from public.dev_units where id = p_unit;
  if u.id is not null and public.is_member(u.org_id) and not public.org_is_open(u.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if u.id is null or not public.can_write(u.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.people where id = p_buyer and org_id = u.org_id) then
    raise exception 'sale_buyer_missing' using errcode = '23514';
  end if;
  if u.status in ('reserved', 'sold') or exists (select 1 from public.dev_sales where unit_id = u.id and status <> 'cancelled') then
    raise exception 'unit_not_available' using errcode = '23514';
  end if;
  if p_price_cents is null or p_price_cents <= 0 or jsonb_typeof(p_schedule) <> 'array' then
    raise exception 'sale_invalid' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_schedule);
  if v_n < 1 or v_n > 24 then raise exception 'schedule_invalid' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_schedule) loop
    m := (e->>'milestone')::public.dev_milestone;
    if (e->>'pct')::numeric is null or (e->>'pct')::numeric <= 0 or (m = 'date' and nullif(e->>'due_date', '') is null) then
      raise exception 'schedule_invalid' using errcode = '22023';
    end if;
    v_sum := v_sum + (e->>'pct')::numeric;
    if m = 'contract' then v_ctr := v_ctr + (e->>'pct')::numeric; end if;
    if m in ('keys', 'deed') then v_keys := v_keys + (e->>'pct')::numeric; end if;
  end loop;
  if abs(v_sum - 100) > 0.001 then raise exception 'schedule_not_100' using errcode = '23514'; end if;
  if p_kind = 'vefa' and (v_ctr > 5.0001 or v_keys < 19.9999) then
    raise exception 'schedule_not_vefa' using errcode = '23514';
  end if;

  insert into public.dev_sales (org_id, project_id, unit_id, buyer_person_id, kind, price_cents, notes, created_by)
  values (u.org_id, u.project_id, u.id, p_buyer, p_kind, p_price_cents, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;
  v_left := p_price_cents;
  for e in select * from jsonb_array_elements(p_schedule) loop
    i := i + 1;
    v_amt := case when i = v_n then v_left else floor(p_price_cents * (e->>'pct')::numeric / 100) end;
    v_left := v_left - v_amt;
    insert into public.dev_installments (org_id, sale_id, position, label, milestone, pct, amount_cents, due_date)
    values (u.org_id, v_id, i, left(trim(coalesce(nullif(e->>'label', ''), e->>'milestone')), 120), (e->>'milestone')::public.dev_milestone,
            (e->>'pct')::numeric, v_amt, nullif(e->>'due_date', '')::date);
  end loop;
  update public.dev_units set status = 'reserved', buyer_person_id = p_buyer, price_cents = p_price_cents where id = u.id;
  return v_id;
end $$;

-- Contract getekend: het lot staat op verkocht
create function public.sign_dev_sale(p_sale uuid, p_on date default current_date)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.dev_sales;
begin
  select * into s from public.dev_sales where id = p_sale;
  if s.id is null or not public.can_write(s.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if s.status <> 'reserved' then raise exception 'sale_not_reserved' using errcode = '23514'; end if;
  update public.dev_sales set status = 'signed', signed_on = coalesce(p_on, current_date) where id = s.id;
  update public.dev_units set status = 'sold' where id = s.unit_id;
end $$;

-- Opgeleverd (sleutels overhandigd)
create function public.deliver_dev_sale(p_sale uuid, p_on date default current_date)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.dev_sales;
begin
  select * into s from public.dev_sales where id = p_sale;
  if s.id is null or not public.can_write(s.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if s.status <> 'signed' then raise exception 'sale_not_signed' using errcode = '23514'; end if;
  update public.dev_sales set status = 'delivered', delivered_on = coalesce(p_on, current_date) where id = s.id;
end $$;

-- Annuleren: het lot komt weer vrij. Een getekende verkoop alleen door eigenaar of manager.
create function public.cancel_dev_sale(p_sale uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.dev_sales;
begin
  select * into s from public.dev_sales where id = p_sale;
  if s.id is null or not public.can_write(s.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if s.status in ('cancelled', 'delivered') then raise exception 'sale_closed' using errcode = '23514'; end if;
  if s.status = 'signed' and not public.can_manage(s.org_id) then
    raise exception 'unit_sold_locked' using errcode = '42501';
  end if;
  update public.dev_sales set status = 'cancelled', cancelled_on = current_date where id = s.id;
  -- de wijziging aan het lot gebeurt als systeem: de blokkade op verkochte lots geldt hier niet
  perform set_config('amplify.sale_cancel', 'on', true);
  update public.dev_units set status = 'available', buyer_person_id = null where id = s.unit_id;
  perform set_config('amplify.sale_cancel', 'off', true);
end $$;

-- De blokkade op verkochte lots (10a) laat de annulering door
create or replace function public.dev_units_guard()
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
        or new.buyer_person_id is distinct from old.buyer_person_id) and not public.can_manage(old.org_id)
        and current_setting('amplify.sale_cancel', true) is distinct from 'on' then
      raise exception 'unit_sold_locked' using errcode = '42501';
    end if;
    if new.status <> old.status and new.status in ('available', 'option', 'blocked')
       and current_setting('amplify.sale_cancel', true) is distinct from 'on'
       and exists (select 1 from public.dev_sales where unit_id = old.id and status <> 'cancelled') then
      raise exception 'unit_has_sale' using errcode = '23514';
    end if;
    if new.status <> old.status then new.status_changed_at := now(); end if;
  end if;
  return new;
end $$;

alter table public.dev_sales enable row level security;
alter table public.dev_installments enable row level security;
create policy dev_sales_select on public.dev_sales for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy dev_sales_update on public.dev_sales for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy dev_inst_select on public.dev_installments for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy dev_inst_update on public.dev_installments for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
revoke all on table public.dev_sales, public.dev_installments from anon, authenticated;
grant select on public.dev_sales, public.dev_installments to authenticated;
grant update (notes) on public.dev_sales to authenticated;
grant update (paid_cents, paid_on, reminded_on, due_date) on public.dev_installments to authenticated;

revoke all on function public.dev_installments_paid() from public, anon, authenticated;
revoke all on function public.create_dev_sale(uuid, uuid, bigint, public.dev_sale_kind, jsonb, text), public.sign_dev_sale(uuid, date),
  public.deliver_dev_sale(uuid, date), public.cancel_dev_sale(uuid) from public, anon;
grant execute on function public.create_dev_sale(uuid, uuid, bigint, public.dev_sale_kind, jsonb, text), public.sign_dev_sale(uuid, date),
  public.deliver_dev_sale(uuid, date), public.cancel_dev_sale(uuid) to authenticated;
