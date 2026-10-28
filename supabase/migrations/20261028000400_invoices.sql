-- Amplify Vastgoed, etappe 6f: facturen en notes d'honoraires voor de commissie
--
-- 1. Factuurgegevens van het kantoor (organizations): naam zoals op de factuur, vorm (société of auto-entrepreneur),
--    adres, ICE, IF, RC, taxe professionnelle, RIB en of het kantoor btw rekent (en welk tarief). Alleen eigenaar en
--    manager mogen ze wijzigen (zelfde regel als de publieke kantoorgegevens).
-- 2. invoices: een factuur of note d'honoraires, meestal bij een deal. Regels volgens artikel 145 van de CGI:
--    * Doorlopende nummering per kantoor en per jaar zonder gaten (F-2026-0001, F-2026-0002, ...). Het nummer geeft de
--      database, nooit de app.
--    * Na uitgifte staat de inhoud vast: verkoper, klant, regels en bedragen kunnen niet meer veranderen. Alleen de
--      status (betaald, geannuleerd), de betaaldatum en de betaalwijze. Een fout herstel je door te annuleren en een
--      nieuwe factuur te maken; het geannuleerde nummer blijft bestaan (geen gat in de nummering).
--    * Bedragen in centimes. Btw volgens de instelling van het kantoor; een auto-entrepreneur rekent geen btw.
--    * De gegevens van de verkoper worden bij uitgifte vastgelegd in de factuur zelf, zodat een latere wijziging
--      van adres of ICE oude facturen niet verandert.
--    * Zonder naam, ICE en IF van het kantoor kan er geen factuur gemaakt worden.
--    * Aanmaken: eigenaar, manager en agent (can_write). Status wijzigen: eigenaar en manager. Lezen: alle leden behalve
--      viewer (facturen bevatten klantgegevens en bedragen).

-- 1. Factuurgegevens ------------------------------------------------------------------------------------------
alter table public.organizations
  add column legal_name     text check (legal_name is null or char_length(legal_name) <= 200),
  add column legal_form     text check (legal_form is null or legal_form in ('company', 'auto_entrepreneur')),
  add column legal_address  text check (legal_address is null or char_length(legal_address) <= 300),
  add column ice            text check (ice is null or ice ~ '^[0-9]{15}$'),
  add column if_number      text check (if_number is null or char_length(if_number) <= 30),
  add column rc_number      text check (rc_number is null or char_length(rc_number) <= 60),
  add column tp_number      text check (tp_number is null or char_length(tp_number) <= 30),
  add column rib            text check (rib is null or char_length(rib) <= 60),
  add column vat_rate       numeric(4,2) not null default 20 check (vat_rate between 0 and 30),
  add column invoice_footer text check (invoice_footer is null or char_length(invoice_footer) <= 500);

grant update (legal_name, legal_form, legal_address, ice, if_number, rc_number, tp_number, rib, vat_rate, invoice_footer)
  on public.organizations to authenticated;

-- 2. Facturen -------------------------------------------------------------------------------------------------
create type public.invoice_status as enum ('issued', 'paid', 'cancelled');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  deal_id         uuid,
  year            integer not null,
  seq             integer not null,
  number          text not null,
  title           text not null check (title in ('facture', 'note_honoraires')),
  issued_on       date not null default current_date,
  due_on          date,
  seller          jsonb not null,
  client_name     text not null check (char_length(trim(client_name)) between 2 and 200),
  client_address  text check (client_address is null or char_length(client_address) <= 300),
  client_ice      text check (client_ice is null or client_ice ~ '^[0-9]{15}$'),
  lines           jsonb not null,
  subtotal_cents  bigint not null check (subtotal_cents >= 0),
  vat_rate        numeric(4,2) not null,
  vat_cents       bigint not null check (vat_cents >= 0),
  total_cents     bigint not null check (total_cents >= 0),
  notes           text check (notes is null or char_length(notes) <= 1000),
  status          public.invoice_status not null default 'issued',
  paid_on         date,
  payment_method  text check (payment_method is null or payment_method in ('transfer', 'cheque', 'cash', 'card', 'other')),
  cancelled_on    date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, year, seq),
  unique (org_id, number),
  foreign key (deal_id, org_id) references public.deals (id, org_id),
  check ((status = 'paid') = (paid_on is not null)),
  check ((status = 'cancelled') = (cancelled_on is not null)),
  check (due_on is null or due_on >= issued_on)
);
create index invoices_org_idx  on public.invoices (org_id, issued_on desc);
create index invoices_deal_idx on public.invoices (deal_id);

-- Betaald en geannuleerd zetten de datum (standaard vandaag); de inhoud van een uitgegeven factuur staat vast.
create function public.invoices_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' then new.paid_on := coalesce(new.paid_on, current_date); else new.paid_on := null; end if;
  if new.status = 'cancelled' then new.cancelled_on := coalesce(new.cancelled_on, current_date); else new.cancelled_on := null; end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'invoice_cancelled' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger invoices_touch  before update on public.invoices for each row execute function public.touch_updated_at();
create trigger invoices_guard  before update on public.invoices for each row execute function public.invoices_guard();

-- Een factuur maken. p_lines: [{"label": "...", "qty": 1, "unit_cents": 5000000}, ...] (bedragen zonder btw).
create function public.create_invoice(
  p_org uuid, p_deal uuid, p_title text, p_client_name text, p_client_address text, p_client_ice text,
  p_lines jsonb, p_issued_on date default current_date, p_due_on date default null, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o        public.organizations;
  v_year   integer := extract(year from coalesce(p_issued_on, current_date))::int;
  v_seq    integer;
  v_lines  jsonb := '[]'::jsonb;
  v_sub    bigint := 0;
  v_rate   numeric(4,2);
  v_vat    bigint;
  l        jsonb;
  v_label  text;
  v_qty    numeric;
  v_unit   bigint;
  v_id     uuid;
  v_prefix text;
begin
  if public.is_member(p_org) and not public.org_is_open(p_org) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if not public.can_write(p_org) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  -- Een factuur tegelijk per kantoor, zodat de nummering doorloopt zonder gaten
  select * into o from public.organizations where id = p_org for update;
  if coalesce(trim(o.legal_name), '') = '' or o.ice is null or coalesce(trim(o.if_number), '') = '' then
    raise exception 'billing_info_missing' using errcode = '23514';
  end if;
  if p_deal is not null and not exists (select 1 from public.deals where id = p_deal and org_id = p_org) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then
    raise exception 'invoice_lines_invalid' using errcode = '22023';
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_label := left(trim(coalesce(l->>'label', '')), 300);
    v_qty   := coalesce((l->>'qty')::numeric, 1);
    v_unit  := (l->>'unit_cents')::bigint;
    if v_label = '' or v_qty <= 0 or v_qty > 10000 or v_unit is null or v_unit < 0 then
      raise exception 'invoice_lines_invalid' using errcode = '22023';
    end if;
    v_lines := v_lines || jsonb_build_object('label', v_label, 'qty', v_qty, 'unit_cents', v_unit, 'total_cents', round(v_qty * v_unit)::bigint);
    v_sub := v_sub + round(v_qty * v_unit)::bigint;
  end loop;

  v_rate := case when o.legal_form = 'auto_entrepreneur' then 0 else o.vat_rate end;
  v_vat := round(v_sub * v_rate / 100)::bigint;
  select coalesce(max(seq), 0) + 1 into v_seq from public.invoices where org_id = p_org and year = v_year;
  v_prefix := case when p_title = 'note_honoraires' then 'NH' else 'F' end;

  insert into public.invoices (org_id, deal_id, year, seq, number, title, issued_on, due_on, seller,
                               client_name, client_address, client_ice, lines, subtotal_cents, vat_rate, vat_cents, total_cents,
                               notes, created_by)
  values (p_org, p_deal, v_year, v_seq, v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 4, '0'),
          case when p_title = 'note_honoraires' then 'note_honoraires' else 'facture' end,
          coalesce(p_issued_on, current_date), p_due_on,
          jsonb_build_object('name', o.legal_name, 'form', o.legal_form, 'address', o.legal_address, 'ice', o.ice,
                             'if', o.if_number, 'rc', o.rc_number, 'tp', o.tp_number, 'rib', o.rib,
                             'phone', o.public_phone, 'email', o.public_email, 'footer', o.invoice_footer, 'office', o.name),
          trim(p_client_name), nullif(trim(coalesce(p_client_address, '')), ''), nullif(regexp_replace(coalesce(p_client_ice, ''), '\s', '', 'g'), ''),
          v_lines, v_sub, v_rate, v_vat, v_sub + v_vat, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

alter table public.invoices enable row level security;
create policy invoices_select on public.invoices
  for select to authenticated using (public.can_write(org_id) or (public.is_member(org_id) and public.my_role(org_id) <> 'viewer'));
create policy invoices_update on public.invoices
  for update to authenticated using (public.can_manage(org_id) and public.org_is_open(org_id))
  with check (public.can_manage(org_id) and public.org_is_open(org_id));

revoke all on table public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;
grant update (status, paid_on, payment_method, cancelled_on) on public.invoices to authenticated;

revoke all on function public.invoices_guard() from public, anon, authenticated;
revoke all on function public.create_invoice(uuid, uuid, text, text, text, text, jsonb, date, date, text) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, text, text, text, text, jsonb, date, date, text) to authenticated;
