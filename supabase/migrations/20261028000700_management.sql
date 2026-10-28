-- Amplify Vastgoed, etappe 7b: beheercontract en maandafrekening voor de eigenaar (gestion locative)
--
-- Het kantoor beheert een verhuurd pand voor de eigenaar: het int de huur, laat reparaties doen en betaalt de eigenaar
-- elke maand uit. Daarvoor:
--  1. management_contracts: per pand een beheercontract met de eigenaar, de beheerfee (percentage van de ontvangen huur),
--     de dag van uitbetaling en het RIB van de eigenaar. Per pand hooguit een lopend contract.
--  2. owner_statements: per contract en per maand een afrekening. De database rekent:
--       ontvangen huur      = huur die in die maand als betaald is gemarkeerd (betaaldatum in die maand)
--       beheerfee           = fee_pct van de ontvangen huur
--       reparaties          = afgeronde reparaties ten laste van de eigenaar (afgerond in die maand, met kosten)
--       uit te betalen      = ontvangen huur - beheerfee - reparaties (kan negatief zijn: dan is de eigenaar het kantoor iets schuldig)
--     Een afrekening opnieuw maken rekent hem opnieuw uit, zolang hij nog niet is uitbetaald. Daarna ligt hij vast.
--  3. De eigenaar ziet zijn afrekeningen in het eigenaarsportaal (7a).
--
-- Rechten: aanmaken en wijzigen eigenaar, manager en agent (can_write); uitbetaald zetten alleen eigenaar en manager.
-- Viewers zien geen contracten en afrekeningen (bedragen en RIB).

create type public.contract_status as enum ('active', 'ended');
create type public.statement_status as enum ('open', 'paid_out');

create table public.management_contracts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  property_id     uuid not null,
  owner_person_id uuid not null,
  fee_pct         numeric(5,2) not null check (fee_pct between 0 and 50),
  start_date      date not null default current_date,
  end_date        date,
  payout_day      smallint not null default 10 check (payout_day between 1 and 28),
  owner_rib       text check (owner_rib is null or char_length(owner_rib) <= 60),
  notes           text check (notes is null or char_length(notes) <= 1000),
  status          public.contract_status not null default 'active',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  foreign key (owner_person_id, org_id) references public.people (id, org_id),
  check (end_date is null or end_date >= start_date)
);
create unique index management_one_active_idx on public.management_contracts (property_id) where status = 'active';
create index management_org_idx on public.management_contracts (org_id, status);

create table public.owner_statements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  contract_id     uuid not null,
  property_id     uuid not null,
  owner_person_id uuid not null,
  period          date not null check (extract(day from period) = 1),
  rent_cents      bigint not null default 0,
  fee_pct         numeric(5,2) not null,
  fee_cents       bigint not null default 0,
  repairs_cents   bigint not null default 0,
  payout_cents    bigint not null default 0,
  details         jsonb not null default '{}'::jsonb,
  status          public.statement_status not null default 'open',
  paid_out_on     date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contract_id, period),
  foreign key (contract_id, org_id) references public.management_contracts (id, org_id),
  check ((status = 'paid_out') = (paid_out_on is not null))
);
create index owner_statements_org_idx on public.owner_statements (org_id, status, period desc);
create index owner_statements_owner_idx on public.owner_statements (owner_person_id, period desc);

create trigger management_touch    before update on public.management_contracts for each row execute function public.touch_updated_at();
create trigger management_org_lock before update on public.management_contracts for each row execute function public.forbid_org_change();
create trigger management_by       before insert on public.management_contracts for each row execute function public.set_created_by();
create trigger statements_touch    before update on public.owner_statements for each row execute function public.touch_updated_at();

-- Pand en eigenaar van een contract staan vast; de eigenaar moet eigenaar van het pand zijn.
create function public.management_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.property_id <> old.property_id or new.owner_person_id <> old.owner_person_id) then
    raise exception 'contract_fixed_links' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.property_parties
       where property_id = new.property_id and person_id = new.owner_person_id and role = 'owner') then
    raise exception 'contract_owner_not_owner' using errcode = '23514';
  end if;
  if new.status = 'ended' then new.end_date := coalesce(new.end_date, current_date); end if;
  return new;
end $$;
create trigger management_guard before insert or update on public.management_contracts
  for each row execute function public.management_guard();

-- Een uitbetaalde afrekening ligt vast (alleen de datum van uitbetaling mag nog), terugzetten kan niet.
create function public.statements_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid_out' then new.paid_out_on := coalesce(new.paid_out_on, current_date); else new.paid_out_on := null; end if;
  if old.status = 'paid_out' and (new.status <> 'paid_out' or new.payout_cents <> old.payout_cents or new.rent_cents <> old.rent_cents
       or new.fee_cents <> old.fee_cents or new.repairs_cents <> old.repairs_cents) then
    raise exception 'statement_paid_out' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger statements_guard before update on public.owner_statements for each row execute function public.statements_guard();

-- De afrekening van een maand maken of opnieuw uitrekenen. p_month: een dag in die maand. Geeft het id terug.
create function public.make_statement(p_contract uuid, p_month date)
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

  v_fee := round(v_rent * c.fee_pct / 100)::bigint;
  v_det := jsonb_build_object(
    'rent', (select coalesce(jsonb_agg(jsonb_build_object('due_date', r.due_date, 'paid_on', r.paid_on, 'amount_cents', r.amount_cents, 'tenant', pe.full_name) order by r.due_date), '[]'::jsonb)
             from public.rent_payments r join public.leases l on l.id = r.lease_id join public.people pe on pe.id = l.tenant_person_id
             where l.property_id = c.property_id and r.status = 'paid' and r.paid_on >= v_from and r.paid_on < v_to),
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

alter table public.management_contracts enable row level security;
alter table public.owner_statements enable row level security;

create policy management_select on public.management_contracts
  for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy management_insert on public.management_contracts
  for insert to authenticated with check (public.can_write(org_id));
create policy management_update on public.management_contracts
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

create policy statements_select on public.owner_statements
  for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy statements_update on public.owner_statements
  for update to authenticated using (public.can_manage(org_id) and public.org_is_open(org_id))
  with check (public.can_manage(org_id) and public.org_is_open(org_id));

revoke all on table public.management_contracts, public.owner_statements from anon, authenticated;
grant select on public.management_contracts, public.owner_statements to authenticated;
grant insert (org_id, property_id, owner_person_id, fee_pct, start_date, end_date, payout_day, owner_rib, notes) on public.management_contracts to authenticated;
grant update (fee_pct, end_date, payout_day, owner_rib, notes, status) on public.management_contracts to authenticated;
grant update (status, paid_out_on) on public.owner_statements to authenticated;

revoke all on function public.management_guard(), public.statements_guard() from public, anon, authenticated;
revoke all on function public.make_statement(uuid, date) from public, anon;
grant execute on function public.make_statement(uuid, date) to authenticated;

-- Het eigenaarsportaal toont nu ook de afrekeningen (laatste 12 maanden). Verder ongewijzigd ten opzichte van 7a.
create or replace function public.owner_portal_statements(p_person uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'period', s.period, 'property', p.title, 'reference', p.reference, 'rent_cents', s.rent_cents, 'fee_pct', s.fee_pct,
           'fee_cents', s.fee_cents, 'repairs_cents', s.repairs_cents, 'payout_cents', s.payout_cents,
           'status', s.status, 'paid_out_on', s.paid_out_on) order by s.period desc, p.title), '[]'::jsonb)
  from public.owner_statements s join public.properties p on p.id = s.property_id
  where s.owner_person_id = p_person and s.period > current_date - interval '13 months'
$$;
revoke all on function public.owner_portal_statements(uuid) from public, anon, authenticated;

create or replace function public.public_owner_portal(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k   public.owner_links;
  o   public.organizations;
  v_props jsonb;
  v_name text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into k from public.owner_links
  where token = p_token and revoked_at is null and expires_at > now();
  if k.id is null then
    return null;
  end if;
  update public.owner_links set last_opened_at = now(), open_count = open_count + 1 where id = k.id;
  select * into o from public.organizations where id = k.org_id;
  select full_name into v_name from public.people where id = k.person_id;

  select coalesce(jsonb_agg(x.j order by x.title), '[]'::jsonb) into v_props
  from (
    select p.title,
      jsonb_build_object(
        'reference', p.reference, 'title', p.title, 'property_type', p.property_type, 'purpose', p.purpose, 'status', p.status,
        'price_cents', p.price_cents, 'city', p.city, 'neighborhood', p.neighborhood,
        'online', p.is_published and public.mandate_is_active(p.id),
        'cover', (select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text from public.property_photos ph
                  where ph.property_id = p.id order by ph.is_cover desc, ph.created_at, ph.id limit 1),
        'mandate_until', (select max(m.valid_until) from public.property_mandates m where m.property_id = p.id and m.status = 'active'),
        'viewings_done', (select count(*) from public.viewings v where v.property_id = p.id and v.status = 'done'),
        'viewings_planned', (select count(*) from public.viewings v where v.property_id = p.id and v.status = 'scheduled' and v.scheduled_at >= now()),
        'interested', (select count(*) from public.viewings v where v.property_id = p.id and v.outcome in ('interested', 'offer_made')),
        'offers', (select count(*) from public.deals d where d.property_id = p.id and d.stage <> 'lost'),
        'page_views', (select coalesce(sum(s.views), 0) from public.page_stats s where s.property_id = p.id),
        'contacts', (select coalesce(sum(s.whatsapp + s.calls + s.forms), 0) from public.page_stats s where s.property_id = p.id),
        'sites', (select coalesce(jsonb_agg(po.site), '[]'::jsonb) from public.property_postings po where po.property_id = p.id and po.status = 'online'),
        'lease', (
          select jsonb_build_object('tenant', pe.full_name, 'rent_cents', l.rent_cents, 'start_date', l.start_date, 'end_date', l.end_date,
            'payments', (select coalesce(jsonb_agg(jsonb_build_object('due_date', r.due_date, 'amount_cents', r.amount_cents, 'status', r.status, 'paid_on', r.paid_on) order by r.due_date desc), '[]'::jsonb)
                         from public.rent_payments r where r.lease_id = l.id and r.status <> 'cancelled' and r.due_date > current_date - interval '12 months'))
          from public.leases l join public.people pe on pe.id = l.tenant_person_id
          where l.property_id = p.id and l.status = 'active' order by l.start_date desc limit 1),
        'repairs', (
          select coalesce(jsonb_agg(jsonb_build_object('title', mr.title, 'status', mr.status, 'reported_on', mr.reported_on, 'done_on', mr.done_on,
                                                       'cost_cents', mr.cost_cents, 'cost_borne_by', mr.cost_borne_by) order by mr.reported_on desc), '[]'::jsonb)
          from public.maintenance_requests mr where mr.property_id = p.id and mr.status <> 'cancelled' and mr.reported_on > current_date - interval '12 months')
      ) as j
    from public.properties p
    join public.property_parties pp on pp.property_id = p.id and pp.person_id = k.person_id and pp.role = 'owner'
    where p.org_id = k.org_id and p.status <> 'withdrawn'
  ) x;

  return jsonb_build_object(
    'owner', jsonb_build_object('name', v_name),
    'lang', k.lang,
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'properties', v_props,
    'statements', public.owner_portal_statements(k.person_id),
    'generated_at', now()
  );
end $$;
