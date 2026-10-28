-- Amplify Vastgoed, etappe 9a/9b: syndic de copropriété (residenties, kavels, tantièmes, appels de fonds)
--
-- Een kantoor dat syndic is van een residentie (loi 18-00) beheert:
--  * residences: de residentie (naam, adres, stad, RIB van de syndic-rekening);
--  * residence_lots: de kavels (appartement, winkel, parking, ...) met hun copropriétaire (een persoon) en het aantal
--    tantièmes (aandelen in de gemeenschappelijke delen);
--  * charge_calls en charge_items: een appel de fonds (bijvoorbeeld "Charges 1er trimestre 2027") met een totaalbedrag
--    dat de database over de kavels verdeelt naar tantièmes (of gelijk per kavel). Per kavel houdt het kantoor bij wat
--    betaald is; wat te laat is, is achterstand.
--
-- Regels:
--  * Bedragen in centimes. De verdeling telt altijd precies op tot het totaal: de afrondingsrest gaat naar de kavels met
--    de meeste tantièmes.
--  * Een appel de fonds ligt vast na het maken (bedragen per kavel); alleen betalingen worden bijgewerkt. Annuleren kan
--    zolang er nog niets betaald is.
--  * Aanmaken en wijzigen: eigenaar, manager en agent (can_write). Viewers zien de residenties en kavels, maar geen
--    appels de fonds en betalingen.

create type public.lot_kind as enum ('apartment', 'shop', 'office', 'parking', 'storage', 'other');
create type public.charge_basis as enum ('tantiemes', 'equal');
create type public.charge_call_status as enum ('issued', 'cancelled');

create table public.residences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  name        text not null check (char_length(trim(name)) between 2 and 200),
  address     text check (address is null or char_length(address) <= 300),
  city        text check (city is null or char_length(city) <= 100),
  rib         text check (rib is null or char_length(rib) <= 60),
  notes       text check (notes is null or char_length(notes) <= 2000),
  archived    boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index residences_org_idx on public.residences (org_id, name);

create table public.residence_lots (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  residence_id    uuid not null,
  label           text not null check (char_length(trim(label)) between 1 and 60),
  kind            public.lot_kind not null default 'apartment',
  floor           text check (floor is null or char_length(floor) <= 20),
  tantiemes       numeric(10,2) not null default 0 check (tantiemes >= 0),
  owner_person_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id),
  unique (residence_id, label),
  foreign key (residence_id, org_id) references public.residences (id, org_id),
  foreign key (owner_person_id, org_id) references public.people (id, org_id)
);
create index residence_lots_res_idx on public.residence_lots (residence_id);

create table public.charge_calls (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  residence_id  uuid not null,
  title         text not null check (char_length(trim(title)) between 2 and 200),
  due_date      date not null,
  total_cents   bigint not null check (total_cents > 0),
  basis         public.charge_basis not null default 'tantiemes',
  status        public.charge_call_status not null default 'issued',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (residence_id, org_id) references public.residences (id, org_id)
);
create index charge_calls_res_idx on public.charge_calls (residence_id, due_date desc);

create table public.charge_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  call_id      uuid not null,
  lot_id       uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_cents   bigint not null default 0 check (paid_cents >= 0),
  paid_on      date,
  reminded_on  date,
  note         text check (note is null or char_length(note) <= 300),
  unique (call_id, lot_id),
  foreign key (call_id, org_id) references public.charge_calls (id, org_id),
  foreign key (lot_id, org_id) references public.residence_lots (id, org_id),
  check (paid_cents <= amount_cents)
);
create index charge_items_lot_idx on public.charge_items (lot_id);

create trigger residences_touch    before update on public.residences for each row execute function public.touch_updated_at();
create trigger residences_org_lock before update on public.residences for each row execute function public.forbid_org_change();
create trigger residences_by       before insert on public.residences for each row execute function public.set_created_by();
create trigger lots_touch          before update on public.residence_lots for each row execute function public.touch_updated_at();
create trigger lots_org_lock       before update on public.residence_lots for each row execute function public.forbid_org_change();

-- Betaald: datum vanzelf (standaard vandaag); niets betaald: geen datum. Het bedrag per kavel staat vast
-- (alleen issue_charge_call zelf verdeelt de afrondingsrest).
create function public.charge_items_paid()
returns trigger language plpgsql as $$
begin
  if new.amount_cents <> old.amount_cents and current_setting('amplify.issuing', true) is distinct from 'on' then
    raise exception 'charge_amount_fixed' using errcode = '23514';
  end if;
  if new.paid_cents > 0 then new.paid_on := coalesce(new.paid_on, current_date); else new.paid_on := null; end if;
  return new;
end $$;
create trigger charge_items_paid before update on public.charge_items for each row execute function public.charge_items_paid();

-- Een appel de fonds maken en verdelen over de kavels. Geeft het id terug.
create function public.issue_charge_call(p_residence uuid, p_title text, p_due date, p_total_cents bigint, p_basis public.charge_basis default 'tantiemes')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r       public.residences;
  v_id    uuid;
  v_sum   numeric;
  v_n     integer;
  v_left  bigint;
  l       record;
  v_amt   bigint;
begin
  select * into r from public.residences where id = p_residence;
  if r.id is not null and public.is_member(r.org_id) and not public.org_is_open(r.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if r.id is null or not public.can_write(r.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if p_total_cents is null or p_total_cents <= 0 or p_due is null then
    raise exception 'charge_call_invalid' using errcode = '22023';
  end if;
  select count(*), coalesce(sum(tantiemes), 0) into v_n, v_sum from public.residence_lots where residence_id = r.id;
  if v_n = 0 then
    raise exception 'charge_call_no_lots' using errcode = '23514';
  end if;
  if p_basis = 'tantiemes' and v_sum <= 0 then
    raise exception 'charge_call_no_tantiemes' using errcode = '23514';
  end if;

  insert into public.charge_calls (org_id, residence_id, title, due_date, total_cents, basis, created_by)
  values (r.org_id, r.id, trim(p_title), p_due, p_total_cents, p_basis, auth.uid()) returning id into v_id;

  v_left := p_total_cents;
  perform set_config('amplify.issuing', 'on', true);
  for l in select id, tantiemes from public.residence_lots where residence_id = r.id order by tantiemes desc, label loop
    v_amt := case when p_basis = 'equal' then floor(p_total_cents::numeric / v_n) else floor(p_total_cents * l.tantiemes / v_sum) end;
    insert into public.charge_items (org_id, call_id, lot_id, amount_cents) values (r.org_id, v_id, l.id, v_amt);
    v_left := v_left - v_amt;
  end loop;
  -- De afrondingsrest (enkele centimes) gaat een voor een naar de grootste kavels
  for l in select ci.id from public.charge_items ci join public.residence_lots rl on rl.id = ci.lot_id
           where ci.call_id = v_id and (p_basis = 'equal' or rl.tantiemes > 0) order by rl.tantiemes desc, rl.label loop
    exit when v_left <= 0;
    update public.charge_items set amount_cents = amount_cents + 1 where id = l.id;
    v_left := v_left - 1;
  end loop;
  perform set_config('amplify.issuing', 'off', true);
  return v_id;
end $$;

-- Annuleren kan zolang er nog niets betaald is
create function public.cancel_charge_call(p_call uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.charge_calls;
begin
  select * into c from public.charge_calls where id = p_call;
  if c.id is null or not public.can_write(c.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if exists (select 1 from public.charge_items where call_id = c.id and paid_cents > 0) then
    raise exception 'charge_call_has_payments' using errcode = '23514';
  end if;
  update public.charge_calls set status = 'cancelled' where id = c.id;
end $$;

alter table public.residences enable row level security;
alter table public.residence_lots enable row level security;
alter table public.charge_calls enable row level security;
alter table public.charge_items enable row level security;

create policy residences_select on public.residences for select to authenticated using (public.is_member(org_id));
create policy residences_insert on public.residences for insert to authenticated with check (public.can_write(org_id));
create policy residences_update on public.residences for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy lots_select on public.residence_lots for select to authenticated using (public.is_member(org_id));
create policy lots_insert on public.residence_lots for insert to authenticated with check (public.can_write(org_id));
create policy lots_update on public.residence_lots for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy lots_delete on public.residence_lots for delete to authenticated using (public.can_write(org_id));
create policy calls_select on public.charge_calls for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy items_select on public.charge_items for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy items_update on public.charge_items for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.residences, public.residence_lots, public.charge_calls, public.charge_items from anon, authenticated;
grant select on public.residences, public.residence_lots, public.charge_calls, public.charge_items to authenticated;
grant insert (org_id, name, address, city, rib, notes) on public.residences to authenticated;
grant update (name, address, city, rib, notes, archived) on public.residences to authenticated;
grant insert (org_id, residence_id, label, kind, floor, tantiemes, owner_person_id) on public.residence_lots to authenticated;
grant update (label, kind, floor, tantiemes, owner_person_id) on public.residence_lots to authenticated;
grant delete on public.residence_lots to authenticated;
grant update (paid_cents, paid_on, reminded_on, note) on public.charge_items to authenticated;

revoke all on function public.charge_items_paid() from public, anon, authenticated;
revoke all on function public.issue_charge_call(uuid, text, date, bigint, public.charge_basis), public.cancel_charge_call(uuid) from public, anon;
grant execute on function public.issue_charge_call(uuid, text, date, bigint, public.charge_basis), public.cancel_charge_call(uuid) to authenticated;
