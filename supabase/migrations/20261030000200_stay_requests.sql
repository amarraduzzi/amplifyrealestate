-- Amplify Vastgoed, etappe 12c: de aanvraaglink voor korte verhuur
--
-- Op de publieke pagina van een woning voor korte verhuur ziet de gast de vrije data en de juiste prijs (nachten,
-- weekendprijs, schoonmaak, borg en voorschot), en vraagt hij aan: naam, WhatsApp, aantal personen, aankomsttijd,
-- huisregels aangevinkt, en eventueel een bod. De verhuurder accepteert, weigert of stelt iets anders voor. Bij
-- accepteren blijven de data een aantal uur (standaard 24) voor de gast vast; de gast ziet de betaalgegevens, betaalt
-- het voorschot buiten de app en meldt dat. De verhuurder bevestigt met een tik: dan wordt het een boeking (met
-- onthaal- en schoonmaaktaak, en de gastenpagina van de woning uit 12b).
--
--  * stay_rates: per woning de tarieven: weekendprijs, schoonmaak, borg, voorschot %, minimum nachten, maximum
--    personen, laagste bod (% van de prijs, leeg = geen bod), betaalgegevens en hoe lang een optie geldt.
--  * stay_requests: de aanvragen, met een geheime link voor de gast (/b/<code>) om de stand te volgen.
--
-- Regels: de prijs rekent de database uit, nooit de browser. Bezette data (bevestigde boekingen en lopende opties)
-- kunnen niet aangevraagd worden. Maximaal 20 aanvragen per uur per kantoor, dezelfde gast niet twee keer binnen
-- 10 minuten voor dezelfde woning. Bezoekers zien nooit gegevens van andere gasten.

create table public.stay_rates (
  property_id         uuid primary key,
  org_id              uuid not null,
  weekend_price_cents bigint check (weekend_price_cents is null or weekend_price_cents > 0),
  cleaning_cents      bigint not null default 0 check (cleaning_cents >= 0),
  deposit_cents       bigint not null default 0 check (deposit_cents >= 0),
  advance_pct         numeric(5,2) not null default 30 check (advance_pct between 0 and 100),
  min_nights          smallint not null default 1 check (min_nights between 1 and 60),
  max_guests          smallint check (max_guests is null or max_guests between 1 and 50),
  min_offer_pct       numeric(5,2) check (min_offer_pct is null or min_offer_pct between 50 and 100),
  payment_info        text check (payment_info is null or char_length(payment_info) <= 1000),
  hold_hours          smallint not null default 24 check (hold_hours between 2 and 72),
  requests_on         boolean not null default true,
  updated_at          timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id) on delete cascade
);
create trigger stay_rates_touch before update on public.stay_rates for each row execute function public.touch_updated_at();
create trigger stay_rates_org_lock before update on public.stay_rates for each row execute function public.forbid_org_change();
alter table public.stay_rates enable row level security;
create policy stay_rates_select on public.stay_rates for select to authenticated using (public.is_member(org_id));
create policy stay_rates_insert on public.stay_rates for insert to authenticated with check (public.can_write(org_id));
create policy stay_rates_update on public.stay_rates for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
revoke all on table public.stay_rates from anon, authenticated;
grant select on public.stay_rates to authenticated;
grant insert (property_id, org_id, weekend_price_cents, cleaning_cents, deposit_cents, advance_pct, min_nights, max_guests, min_offer_pct, payment_info, hold_hours, requests_on)
  on public.stay_rates to authenticated;
grant update (weekend_price_cents, cleaning_cents, deposit_cents, advance_pct, min_nights, max_guests, min_offer_pct, payment_info, hold_hours, requests_on)
  on public.stay_rates to authenticated;

create type public.stay_request_status as enum ('new', 'accepted', 'paid_claimed', 'confirmed', 'declined', 'counter', 'expired', 'cancelled');

create table public.stay_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  property_id   uuid not null,
  token         text not null unique check (token ~ '^[0-9a-f]{64}$'),
  guest_name    text not null check (char_length(trim(guest_name)) between 2 and 120),
  guest_phone   text not null check (char_length(guest_phone) between 6 and 40),
  guests        smallint not null check (guests between 1 and 50),
  check_in      date not null,
  check_out     date not null,
  arrival_time  text check (arrival_time is null or char_length(arrival_time) <= 20),
  message       text check (message is null or char_length(message) <= 1000),
  lang          text not null default 'fr' check (lang in ('fr', 'en', 'ar', 'nl')),
  nights        smallint not null,
  quote_cents   bigint not null,
  offer_cents   bigint check (offer_cents is null or offer_cents > 0),
  total_cents   bigint not null,
  advance_cents bigint not null,
  deposit_cents bigint not null default 0,
  status        public.stay_request_status not null default 'new',
  host_note     text check (host_note is null or char_length(host_note) <= 500),
  hold_until    timestamptz,
  stay_id       uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  foreign key (stay_id) references public.stays (id) on delete set null,
  check (check_out > check_in)
);
create index stay_requests_org_idx on public.stay_requests (org_id, created_at desc);
create index stay_requests_prop_idx on public.stay_requests (property_id, check_in);
create trigger stay_requests_touch before update on public.stay_requests for each row execute function public.touch_updated_at();

alter table public.stay_requests enable row level security;
create policy stay_requests_select on public.stay_requests for select to authenticated using (public.is_member(org_id));
revoke all on table public.stay_requests from anon, authenticated;
grant select on public.stay_requests to authenticated;

-- Is de periode vrij? (bevestigde boekingen en lopende opties, behalve de eigen aanvraag)
create function public.stay_period_free(p_property uuid, p_in date, p_out date, p_except uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.stays s where s.property_id = p_property and s.status = 'confirmed' and s.check_in < p_out and p_in < s.check_out)
     and not exists (select 1 from public.stay_requests r where r.property_id = p_property and r.id is distinct from p_except
                       and r.status in ('accepted', 'paid_claimed') and r.hold_until > now() and r.check_in < p_out and p_in < r.check_out)
$$;

-- De prijs van een verblijf: per nacht (vrijdag- en zaterdagnacht tegen de weekendprijs), plus schoonmaak
create function public.stay_quote(p_property uuid, p_in date, p_out date)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when extract(isodow from d) in (5, 6) and g.weekend_price_cents is not null then g.weekend_price_cents else p.price_cents end), 0)
         + coalesce(max(g.cleaning_cents), 0)
  from public.properties p left join public.stay_rates g on g.property_id = p.id
  cross join generate_series(p_in, p_out - 1, interval '1 day') d
  where p.id = p_property
$$;

-- Wat een bezoeker nodig heeft om aan te vragen: tarieven en bezette periodes (komende 12 maanden)
create function public.public_stay_booking(p_slug text, p_reference text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o public.organizations; p public.properties; g public.stay_rates; gd public.stay_guides;
begin
  select * into o from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if o.id is null then return null; end if;
  select * into p from public.properties where org_id = o.id and lower(reference) = lower(trim(coalesce(p_reference, '')))
    and is_published and purpose = 'rent_short' and status = 'available' and public.mandate_is_active(id) and price_cents is not null;
  if p.id is null then return null; end if;
  select * into g from public.stay_rates where property_id = p.id;
  select * into gd from public.stay_guides where property_id = p.id;
  if g.property_id is not null and not g.requests_on then return null; end if;
  return jsonb_build_object(
    'price_cents', p.price_cents, 'weekend_price_cents', g.weekend_price_cents, 'cleaning_cents', coalesce(g.cleaning_cents, 0),
    'deposit_cents', coalesce(g.deposit_cents, 0), 'advance_pct', coalesce(g.advance_pct, 30), 'min_nights', coalesce(g.min_nights, 1),
    'max_guests', g.max_guests, 'min_offer_pct', g.min_offer_pct, 'checkin_from', gd.checkin_time, 'checkout_until', gd.checkout_time,
    'rules', gd.rules,
    'busy', coalesce((select jsonb_agg(jsonb_build_object('start', x.check_in, 'end', x.check_out) order by x.check_in) from (
        select s.check_in, s.check_out from public.stays s where s.property_id = p.id and s.status = 'confirmed' and s.check_out >= current_date and s.check_in < current_date + 366
        union all
        select r.check_in, r.check_out from public.stay_requests r where r.property_id = p.id and r.status in ('accepted', 'paid_claimed') and r.hold_until > now() and r.check_out >= current_date
      ) x), '[]'::jsonb)
  );
end $$;

create function public.submit_stay_request(p_slug text, p_reference text, p_name text, p_phone text, p_guests integer, p_in date, p_out date,
  p_arrival text, p_message text, p_offer_cents bigint, p_rules_ok boolean, p_lang text default 'fr', p_trap text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.organizations; p public.properties; g public.stay_rates;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_n int; v_quote bigint; v_total bigint; v_token text;
begin
  if coalesce(p_trap, '') <> '' then return repeat('0', 64); end if;
  select * into o from public.organizations where id = public.org_id_for_slug(p_slug) and is_active;
  if o.id is null then raise exception 'request_invalid' using errcode = '22023'; end if;
  select * into p from public.properties where org_id = o.id and lower(reference) = lower(trim(coalesce(p_reference, '')))
    and is_published and purpose = 'rent_short' and status = 'available' and public.mandate_is_active(id) and price_cents is not null;
  if p.id is null then raise exception 'request_invalid' using errcode = '22023'; end if;
  select * into g from public.stay_rates where property_id = p.id;
  if g.property_id is not null and not g.requests_on then raise exception 'request_invalid' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(v_digits) not between 8 and 15 or p_in is null or p_out is null
     or p_out <= p_in or p_in < current_date or p_out - p_in > 60 or coalesce(p_guests, 0) < 1 then
    raise exception 'request_invalid' using errcode = '22023';
  end if;
  if not coalesce(p_rules_ok, false) then raise exception 'request_rules' using errcode = '23514'; end if;
  v_n := p_out - p_in;
  if v_n < coalesce(g.min_nights, 1) then raise exception 'request_min_nights' using errcode = '23514'; end if;
  if g.max_guests is not null and p_guests > g.max_guests then raise exception 'request_too_many' using errcode = '23514'; end if;
  if not public.stay_period_free(p.id, p_in, p_out) then raise exception 'request_taken' using errcode = '23514'; end if;
  if (select count(*) from public.stay_requests where org_id = o.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'request_busy' using errcode = '54000';
  end if;
  if exists (select 1 from public.stay_requests where property_id = p.id and right(regexp_replace(guest_phone, '\D', '', 'g'), 9) = right(v_digits, 9)
               and created_at > now() - interval '10 minutes') then
    raise exception 'request_duplicate' using errcode = '23505';
  end if;
  v_quote := public.stay_quote(p.id, p_in, p_out);
  if p_offer_cents is not null then
    if g.min_offer_pct is null then raise exception 'request_no_offers' using errcode = '23514'; end if;
    if p_offer_cents < ceil(v_quote * g.min_offer_pct / 100) then raise exception 'request_offer_low' using errcode = '23514'; end if;
  end if;
  v_total := least(coalesce(p_offer_cents, v_quote), v_quote);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.stay_requests (org_id, property_id, token, guest_name, guest_phone, guests, check_in, check_out, arrival_time, message, lang,
    nights, quote_cents, offer_cents, total_cents, advance_cents, deposit_cents)
  values (o.id, p.id, v_token, trim(p_name), trim(p_phone), p_guests, p_in, p_out, nullif(left(trim(coalesce(p_arrival, '')), 20), ''),
    nullif(left(trim(coalesce(p_message, '')), 1000), ''), case when p_lang in ('fr', 'en', 'ar', 'nl') then p_lang else 'fr' end,
    v_n, v_quote, p_offer_cents, v_total, round(v_total * coalesce(g.advance_pct, 30) / 100), coalesce(g.deposit_cents, 0));
  insert into public.tasks (org_id, title, notes, due_date, property_id)
  values (o.id, left('Demande de réservation : ' || trim(p_name) || ' · ' || p.title, 200),
          to_char(p_in, 'DD/MM') || ' → ' || to_char(p_out, 'DD/MM') || ' · ' || p_guests || ' pers.' || case when p_offer_cents is not null then ' · offre' else '' end,
          current_date, p.id);
  return v_token;
end $$;

-- De verhuurder: accepteren (optie), weigeren of iets anders voorstellen, betaald bevestigen
create function public.answer_stay_request(p_id uuid, p_action text, p_note text default null, p_in date default null, p_out date default null, p_total_cents bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.stay_requests; g public.stay_rates; v_stay uuid; v_total bigint;
begin
  select * into r from public.stay_requests where id = p_id;
  if r.id is null or not public.can_write(r.org_id) then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  select * into g from public.stay_rates where property_id = r.property_id;
  if p_action = 'accept' then
    if r.status not in ('new', 'counter', 'expired') then raise exception 'request_closed' using errcode = '23514'; end if;
    if not public.stay_period_free(r.property_id, r.check_in, r.check_out, r.id) then raise exception 'request_taken' using errcode = '23514'; end if;
    update public.stay_requests set status = 'accepted', hold_until = now() + make_interval(hours => coalesce(g.hold_hours, 24)),
      host_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), host_note) where id = r.id;
  elsif p_action = 'decline' then
    if r.status in ('confirmed', 'cancelled') then raise exception 'request_closed' using errcode = '23514'; end if;
    update public.stay_requests set status = 'declined', host_note = nullif(trim(coalesce(p_note, '')), '') where id = r.id;
  elsif p_action = 'counter' then
    if r.status not in ('new', 'counter', 'expired') then raise exception 'request_closed' using errcode = '23514'; end if;
    if p_in is not null and p_out is not null then
      if p_out <= p_in or p_in < current_date then raise exception 'request_invalid' using errcode = '22023'; end if;
      v_total := coalesce(p_total_cents, public.stay_quote(r.property_id, p_in, p_out));
      update public.stay_requests set check_in = p_in, check_out = p_out, nights = p_out - p_in, quote_cents = public.stay_quote(r.property_id, p_in, p_out),
        total_cents = v_total, advance_cents = round(v_total * coalesce(g.advance_pct, 30) / 100) where id = r.id;
    elsif p_total_cents is not null then
      update public.stay_requests set total_cents = p_total_cents, advance_cents = round(p_total_cents * coalesce(g.advance_pct, 30) / 100) where id = r.id;
    end if;
    update public.stay_requests set status = 'counter', host_note = nullif(trim(coalesce(p_note, '')), '') where id = r.id;
  elsif p_action = 'confirm' then
    if r.status not in ('accepted', 'paid_claimed') then raise exception 'request_closed' using errcode = '23514'; end if;
    if not public.stay_period_free(r.property_id, r.check_in, r.check_out, r.id) then raise exception 'request_taken' using errcode = '23514'; end if;
    insert into public.stays (org_id, property_id, guest_name, guest_phone, channel, check_in, check_out, guests, total_cents, cleaning_cents, notes, guest_lang)
    values (r.org_id, r.property_id, r.guest_name, r.guest_phone, 'direct', r.check_in, r.check_out, r.guests, r.total_cents, coalesce(g.cleaning_cents, 0),
            left(concat_ws(' · ', 'Via la demande en ligne', 'acompte ' || r.advance_cents / 100 || ' DH reçu', case when r.arrival_time is not null then 'arrivée ' || r.arrival_time end, r.message), 1000), r.lang)
    returning id into v_stay;
    update public.stay_requests set status = 'confirmed', stay_id = v_stay where id = r.id;
  else
    raise exception 'request_invalid' using errcode = '22023';
  end if;
end $$;

-- Voor de gast: de stand van zijn aanvraag (en de betaalgegevens zodra de verhuurder accepteerde)
create function public.public_stay_request(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.stay_requests; p public.properties; o public.organizations; g public.stay_rates; gd public.stay_guides;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into r from public.stay_requests where token = p_token;
  if r.id is null then return null; end if;
  -- een optie die verlopen is zonder betaling, komt weer vrij
  if r.status = 'accepted' and r.hold_until <= now() then
    update public.stay_requests set status = 'expired' where id = r.id returning * into r;
  end if;
  select * into p from public.properties where id = r.property_id;
  select * into o from public.organizations where id = r.org_id;
  select * into g from public.stay_rates where property_id = r.property_id;
  select * into gd from public.stay_guides where property_id = r.property_id;
  return jsonb_build_object(
    'lang', r.lang, 'status', r.status, 'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'property', jsonb_build_object('title', p.title, 'reference', p.reference, 'city', p.city),
    'request', jsonb_build_object('guest', split_part(r.guest_name, ' ', 1), 'check_in', r.check_in, 'check_out', r.check_out, 'nights', r.nights, 'guests', r.guests,
      'quote_cents', r.quote_cents, 'offer_cents', r.offer_cents, 'total_cents', r.total_cents, 'advance_cents', r.advance_cents, 'deposit_cents', r.deposit_cents,
      'hold_until', r.hold_until, 'host_note', r.host_note),
    'payment_info', case when r.status in ('accepted', 'paid_claimed') then g.payment_info end,
    'contact', coalesce(o.public_whatsapp, o.public_phone),
    'guide_token', case when r.status = 'confirmed' then gd.token end
  );
end $$;

-- De gast: "ik heb betaald" (of een tegenvoorstel accepteren / annuleren)
create function public.guest_stay_request(p_token text, p_action text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.stay_requests;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then raise exception 'request_invalid' using errcode = '22023'; end if;
  select * into r from public.stay_requests where token = p_token;
  if r.id is null then raise exception 'request_invalid' using errcode = '22023'; end if;
  if p_action = 'paid' and r.status = 'accepted' and r.hold_until > now() then
    update public.stay_requests set status = 'paid_claimed' where id = r.id;
    insert into public.tasks (org_id, title, due_date, property_id)
    select r.org_id, left('Vérifier le paiement de ' || r.guest_name, 200), current_date, r.property_id;
  elsif p_action = 'accept_counter' and r.status = 'counter' then
    if not public.stay_period_free(r.property_id, r.check_in, r.check_out, r.id) then raise exception 'request_taken' using errcode = '23514'; end if;
    update public.stay_requests set status = 'new' where id = r.id;
  elsif p_action = 'cancel' and r.status in ('new', 'counter', 'accepted') then
    update public.stay_requests set status = 'cancelled' where id = r.id;
  else
    raise exception 'request_closed' using errcode = '23514';
  end if;
  return true;
end $$;

revoke all on function public.stay_period_free(uuid, date, date, uuid), public.stay_quote(uuid, date, date) from public, anon, authenticated;
revoke all on function public.public_stay_booking(text, text),
  public.submit_stay_request(text, text, text, text, integer, date, date, text, text, bigint, boolean, text, text),
  public.answer_stay_request(uuid, text, text, date, date, bigint), public.public_stay_request(text), public.guest_stay_request(text, text) from public;
grant execute on function public.public_stay_booking(text, text),
  public.submit_stay_request(text, text, text, text, integer, date, date, text, text, bigint, boolean, text, text),
  public.public_stay_request(text), public.guest_stay_request(text, text) to anon, authenticated;
grant execute on function public.answer_stay_request(uuid, text, text, date, date, bigint) to authenticated;
