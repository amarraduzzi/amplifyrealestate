-- Amplify Vastgoed, etappe 7e: korte verhuur en conciergerie
--
-- Voor panden met doel "korte verhuur" (rent_short) houdt het kantoor de boekingen bij: gast, kanaal (direct, Airbnb,
-- Booking, ...), aankomst en vertrek, aantal gasten, totaalprijs, schoonmaakkosten en de commissie van het kanaal.
--
-- Regels:
--  * Twee bevestigde boekingen van hetzelfde pand kunnen niet overlappen (vertrekdag = aankomstdag van de volgende mag).
--  * Bij een bevestigde boeking maakt de database twee taken: "Accueil" op de aankomstdag en "Ménage" op de vertrekdag.
--    Ze staan vanzelf in de Agenda en op Today. Wordt de boeking geannuleerd, dan worden die taken geannuleerd; worden de
--    data gewijzigd, dan schuiven de taken mee.
--  * Per pand een geheime iCal-link (ical_token), zodat Airbnb of Booking de bezette data van directe boekingen kan
--    overnemen. De publieke site levert die als agenda-bestand; er staan alleen data in, geen namen of bedragen.
--  * In de maandafrekening voor de eigenaar (7b) telt bij korte verhuur de opbrengst van de boekingen met vertrek in die
--    maand mee: totaalprijs min commissie van het kanaal. Daarna gaan de beheerfee en de reparaties eraf, zoals bij huur.
--  * Aanmaken en wijzigen: eigenaar, manager en agent (can_write). Alle leden zien de boekingen (de planning).

create type public.stay_channel as enum ('direct', 'airbnb', 'booking', 'other');
create type public.stay_status as enum ('confirmed', 'cancelled');

create table public.stays (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  property_id       uuid not null,
  guest_name        text not null check (char_length(trim(guest_name)) between 1 and 200),
  guest_phone       text check (guest_phone is null or char_length(guest_phone) <= 40),
  channel           public.stay_channel not null default 'direct',
  check_in          date not null,
  check_out         date not null,
  guests            smallint check (guests is null or guests between 1 and 50),
  total_cents       bigint not null default 0 check (total_cents >= 0),
  cleaning_cents    bigint not null default 0 check (cleaning_cents >= 0),
  channel_fee_cents bigint not null default 0 check (channel_fee_cents >= 0),
  notes             text check (notes is null or char_length(notes) <= 1000),
  status            public.stay_status not null default 'confirmed',
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  check (check_out > check_in),
  check (check_out - check_in <= 365)
);
create index stays_property_idx on public.stays (property_id, check_in);
create index stays_org_idx on public.stays (org_id, check_in);

alter table public.properties add column ical_token text unique;

create trigger stays_touch    before update on public.stays for each row execute function public.touch_updated_at();
create trigger stays_org_lock before update on public.stays for each row execute function public.forbid_org_change();
create trigger stays_by       before insert on public.stays for each row execute function public.set_created_by();

-- Alleen voor korte verhuur, en geen overlap met een andere bevestigde boeking
create function public.stays_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.property_id <> old.property_id then
    raise exception 'stay_fixed_property' using errcode = '23514';
  end if;
  if not exists (select 1 from public.properties where id = new.property_id and purpose = 'rent_short') then
    raise exception 'stay_not_short_term' using errcode = '23514';
  end if;
  if new.status = 'confirmed' and exists (
       select 1 from public.stays s
       where s.property_id = new.property_id and s.id <> new.id and s.status = 'confirmed'
         and s.check_in < new.check_out and new.check_in < s.check_out) then
    raise exception 'stay_overlap' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger stays_guard before insert or update on public.stays for each row execute function public.stays_guard();

-- Taken "Accueil" en "Ménage" bijhouden
create function public.stays_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  select title into v_title from public.properties where id = new.property_id;
  if new.status = 'confirmed' then
    insert into public.tasks (org_id, title, due_date, property_id, auto_key, notes)
    values (new.org_id, left('Accueil ' || new.guest_name || ' · ' || v_title, 200), new.check_in, new.property_id, 'stay:' || new.id || ':in',
            nullif(concat_ws(' · ', new.guest_phone, case when new.guests is not null then new.guests || ' pers.' end), ''))
    on conflict (org_id, auto_key) where auto_key is not null
      do update set due_date = excluded.due_date, title = excluded.title, notes = excluded.notes,
                    status = case when public.tasks.status = 'cancelled' then 'open'::public.task_status else public.tasks.status end;
    insert into public.tasks (org_id, title, due_date, property_id, auto_key)
    values (new.org_id, left('Ménage après ' || new.guest_name || ' · ' || v_title, 200), new.check_out, new.property_id, 'stay:' || new.id || ':out')
    on conflict (org_id, auto_key) where auto_key is not null
      do update set due_date = excluded.due_date, title = excluded.title,
                    status = case when public.tasks.status = 'cancelled' then 'open'::public.task_status else public.tasks.status end;
  else
    update public.tasks set status = 'cancelled'
    where org_id = new.org_id and auto_key in ('stay:' || new.id || ':in', 'stay:' || new.id || ':out') and status = 'open';
  end if;
  return null;
end $$;
create trigger stays_tasks after insert or update of status, check_in, check_out, guest_name, guest_phone, guests on public.stays
  for each row execute function public.stays_tasks();

-- De iCal-link van een pand maken (of vernieuwen: de oude link werkt dan niet meer)
create function public.renew_ical_token(p_property uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  v text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select org_id into o from public.properties where id = p_property and purpose = 'rent_short';
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  update public.properties set ical_token = v where id = p_property;
  return v;
end $$;

-- Voor de iCal-link: alleen de bezette data van bevestigde boekingen (vanaf 60 dagen terug)
create function public.public_ical(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', p.title, 'reference', p.reference,
    'busy', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'start', s.check_in, 'end', s.check_out) order by s.check_in)
                      from public.stays s where s.property_id = p.id and s.status = 'confirmed' and s.check_out >= current_date - 60), '[]'::jsonb))
  from public.properties p
  where p_token ~ '^[0-9a-f]{64}$' and p.ical_token = p_token
$$;

alter table public.stays enable row level security;
create policy stays_select on public.stays for select to authenticated using (public.is_member(org_id));
create policy stays_insert on public.stays for insert to authenticated with check (public.can_write(org_id));
create policy stays_update on public.stays for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.stays from anon, authenticated;
grant select on public.stays to authenticated;
grant insert (org_id, property_id, guest_name, guest_phone, channel, check_in, check_out, guests, total_cents, cleaning_cents, channel_fee_cents, notes, status)
  on public.stays to authenticated;
grant update (guest_name, guest_phone, channel, check_in, check_out, guests, total_cents, cleaning_cents, channel_fee_cents, notes, status)
  on public.stays to authenticated;

revoke all on function public.stays_guard(), public.stays_tasks() from public, anon, authenticated;
revoke all on function public.renew_ical_token(uuid), public.public_ical(text) from public, anon;
grant execute on function public.renew_ical_token(uuid) to authenticated;
grant execute on function public.public_ical(text) to anon, authenticated;

-- De maandafrekening (7b) telt nu ook de boekingen mee. Verder ongewijzigd.
create or replace function public.make_statement(p_contract uuid, p_month date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c       public.management_contracts;
  v_from  date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_rent  bigint;
  v_rep   bigint;
  v_fee   bigint;
  v_det   jsonb;
  v_id    uuid;
  v_st    public.statement_status;
begin
  select * into c from public.management_contracts where id = p_contract;
  if c.id is not null and public.is_member(c.org_id) and not public.org_is_open(c.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if c.id is null or not public.can_write(c.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if p_month is null or v_from > date_trunc('month', current_date)::date then
    raise exception 'statement_future_month' using errcode = '22023';
  end if;

  select status into v_st from public.owner_statements where contract_id = c.id and period = v_from;
  if v_st = 'paid_out' then
    raise exception 'statement_paid_out' using errcode = '23514';
  end if;

  select coalesce(sum(r.amount_cents), 0) into v_rent
  from public.rent_payments r join public.leases l on l.id = r.lease_id
  where l.property_id = c.property_id and r.status = 'paid' and r.paid_on >= v_from and r.paid_on < v_to;

  select coalesce(sum(m.cost_cents), 0) into v_rep
  from public.maintenance_requests m
  where m.property_id = c.property_id and m.status = 'done' and m.cost_borne_by = 'owner' and m.cost_cents is not null
    and m.done_on >= v_from and m.done_on < v_to;

  -- Korte verhuur: boekingen met vertrek in die maand, totaalprijs min commissie van het kanaal
  v_rent := v_rent + (select coalesce(sum(s.total_cents - s.channel_fee_cents), 0) from public.stays s
                      where s.property_id = c.property_id and s.status = 'confirmed' and s.check_out >= v_from and s.check_out < v_to);

  v_fee := round(v_rent * c.fee_pct / 100)::bigint;
  v_det := jsonb_build_object(
    'rent', (select coalesce(jsonb_agg(jsonb_build_object('due_date', r.due_date, 'paid_on', r.paid_on, 'amount_cents', r.amount_cents, 'tenant', pe.full_name) order by r.due_date), '[]'::jsonb)
             from public.rent_payments r join public.leases l on l.id = r.lease_id join public.people pe on pe.id = l.tenant_person_id
             where l.property_id = c.property_id and r.status = 'paid' and r.paid_on >= v_from and r.paid_on < v_to),
    'stays', (select coalesce(jsonb_agg(jsonb_build_object('guest', s.guest_name, 'channel', s.channel, 'check_in', s.check_in, 'check_out', s.check_out,
                                                       'total_cents', s.total_cents, 'channel_fee_cents', s.channel_fee_cents) order by s.check_out), '[]'::jsonb)
              from public.stays s where s.property_id = c.property_id and s.status = 'confirmed' and s.check_out >= v_from and s.check_out < v_to),
    'repairs', (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'done_on', m.done_on, 'cost_cents', m.cost_cents) order by m.done_on), '[]'::jsonb)
                from public.maintenance_requests m
                where m.property_id = c.property_id and m.status = 'done' and m.cost_borne_by = 'owner' and m.cost_cents is not null
                  and m.done_on >= v_from and m.done_on < v_to));

  insert into public.owner_statements (org_id, contract_id, property_id, owner_person_id, period, rent_cents, fee_pct, fee_cents, repairs_cents, payout_cents, details, created_by)
  values (c.org_id, c.id, c.property_id, c.owner_person_id, v_from, v_rent, c.fee_pct, v_fee, v_rep, v_rent - v_fee - v_rep, v_det, auth.uid())
  on conflict (contract_id, period) do update
    set rent_cents = excluded.rent_cents, fee_pct = excluded.fee_pct, fee_cents = excluded.fee_cents, repairs_cents = excluded.repairs_cents,
        payout_cents = excluded.payout_cents, details = excluded.details
  returning id into v_id;
  return v_id;
end $$;
