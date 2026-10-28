-- Amplify Vastgoed, etappe 11a: samenwerken in het Network (klanten doorsturen en samen verkopen)
--
-- Bovenop de partnerschappen en gedeelde panden van 5a:
--  * network_referrals: een kantoor stuurt een klant (koper of huurder) door naar een partner, met een
--    doorverwijsvergoeding (een % van de commissie die de partner verdient). De partner accepteert (dan wordt de klant
--    een lead bij de partner, bron "network") of weigert, en meldt later of het gelukt is en de vergoeding betaald is.
--  * network_collabs: een partner heeft een klant voor een gedeeld pand (co-mandaat / inter-cabinet). Het kantoor van
--    het pand accepteert, beide kantoren volgen dezelfde stappen (bezichtiging, bod, getekend, betaald) en zien
--    dezelfde verdeling van de commissie.
--
-- Regels:
--  * Alleen tussen kantoren die partner zijn (5a). Een klant doorsturen kan alleen met toestemming van de klant.
--  * Beide kantoren zien de doorverwijzing of samenwerking; schrijven gaat alleen via de functies hieronder.
--  * De partner ziet nooit het adres, de eigenaar of het mandaat van het pand; het kantoor van het pand ziet de naam
--    van de klant pas als het de samenwerking accepteert.
--  * Bedragen in centimes; de verdeling telt op tot de volledige commissie.

create type public.referral_status as enum ('sent', 'accepted', 'declined', 'won', 'lost');
create type public.collab_status as enum ('proposed', 'accepted', 'visit', 'offer', 'signed', 'paid', 'declined', 'cancelled');

create table public.network_referrals (
  id               uuid primary key default gen_random_uuid(),
  from_org         uuid not null references public.organizations(id),
  to_org           uuid not null references public.organizations(id),
  client_name      text not null check (char_length(trim(client_name)) between 2 and 120),
  client_phone     text not null check (char_length(client_phone) between 6 and 40),
  purpose          public.deal_purpose not null default 'sale',
  city             text check (city is null or char_length(city) <= 100),
  property_types   public.property_type[] not null default '{}',
  budget_max_cents bigint check (budget_max_cents is null or budget_max_cents > 0),
  note             text check (note is null or char_length(note) <= 1000),
  fee_pct          numeric(5,2) not null default 0 check (fee_pct between 0 and 100),
  status           public.referral_status not null default 'sent',
  to_lead_id       uuid,
  commission_cents bigint check (commission_cents is null or commission_cents >= 0),
  fee_cents        bigint check (fee_cents is null or fee_cents >= 0),
  fee_paid_on      date,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  responded_at     timestamptz,
  closed_at        timestamptz,
  check (from_org <> to_org)
);
create index network_referrals_from_idx on public.network_referrals (from_org, created_at desc);
create index network_referrals_to_idx on public.network_referrals (to_org, created_at desc);

create table public.network_collabs (
  id                uuid primary key default gen_random_uuid(),
  listing_org       uuid not null references public.organizations(id),
  partner_org       uuid not null references public.organizations(id),
  property_id       uuid not null,
  client_name       text not null check (char_length(trim(client_name)) between 2 and 120),
  partner_share_pct numeric(5,2) not null check (partner_share_pct between 0 and 100),
  status            public.collab_status not null default 'proposed',
  visit_at          timestamptz,
  price_cents       bigint check (price_cents is null or price_cents > 0),
  commission_cents  bigint check (commission_cents is null or commission_cents >= 0),
  note              text check (note is null or char_length(note) <= 1000),
  paid_on           date,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (property_id, listing_org) references public.properties (id, org_id),
  check (listing_org <> partner_org)
);
create index network_collabs_listing_idx on public.network_collabs (listing_org, created_at desc);
create index network_collabs_partner_idx on public.network_collabs (partner_org, created_at desc);
-- Per pand en partner hooguit een lopende samenwerking per klant
create unique index network_collabs_open_idx on public.network_collabs (property_id, partner_org, lower(client_name))
  where status not in ('declined', 'cancelled', 'paid');
create trigger network_collabs_touch before update on public.network_collabs for each row execute function public.touch_updated_at();

create function public.net_guard(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_member(p_org) and not public.org_is_open(p_org) then raise exception 'plan_expired' using errcode = '42501'; end if;
  if not public.can_write(p_org) then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- klanten doorsturen
create function public.send_referral(p_org uuid, p_partner uuid, p_name text, p_phone text, p_purpose public.deal_purpose,
  p_city text, p_types public.property_type[], p_budget_cents bigint, p_note text, p_fee_pct numeric, p_consent boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.net_guard(p_org);
  if not public.are_partners(p_org, p_partner) then raise exception 'This office is not your partner.'; end if;
  if not coalesce(p_consent, false) then raise exception 'referral_no_consent' using errcode = '23514'; end if;
  if char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 8 and 15 or char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'referral_invalid' using errcode = '22023';
  end if;
  insert into public.network_referrals (from_org, to_org, client_name, client_phone, purpose, city, property_types, budget_max_cents, note, fee_pct, created_by)
  values (p_org, p_partner, trim(p_name), trim(p_phone), coalesce(p_purpose, 'sale'), nullif(trim(coalesce(p_city, '')), ''), coalesce(p_types, '{}'),
          p_budget_cents, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_fee_pct, 0), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- De ontvanger accepteert (de klant wordt een lead) of weigert
create function public.respond_referral(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.network_referrals;
  v_person uuid;
  v_lead uuid;
  v_from text;
begin
  select * into r from public.network_referrals where id = p_id;
  if r.id is null then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  perform public.net_guard(r.to_org);
  if r.status <> 'sent' then raise exception 'referral_closed' using errcode = '23514'; end if;
  if not p_accept then
    update public.network_referrals set status = 'declined', responded_at = now() where id = r.id;
    return;
  end if;
  select name into v_from from public.organizations where id = r.from_org;
  insert into public.people (org_id, full_name, phone, whatsapp, notes)
  values (r.to_org, r.client_name, r.client_phone, r.client_phone, 'Recommandé par ' || v_from)
  returning id into v_person;
  insert into public.leads (org_id, person_id, purpose, status, source, property_types, city, budget_max_cents, notes)
  values (r.to_org, v_person, r.purpose, 'new', 'network', r.property_types, r.city, r.budget_max_cents,
          'Recommandé par ' || v_from || ' (frais de recommandation : ' || r.fee_pct || ' % de la commission)' || coalesce(E'\n' || r.note, ''))
  returning id into v_lead;
  update public.network_referrals set status = 'accepted', responded_at = now(), to_lead_id = v_lead where id = r.id;
end $$;

-- De ontvanger sluit af: gelukt (met de verdiende commissie: de vergoeding wordt berekend) of niet gelukt
create function public.close_referral(p_id uuid, p_won boolean, p_commission_cents bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.network_referrals;
begin
  select * into r from public.network_referrals where id = p_id;
  if r.id is null then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  perform public.net_guard(r.to_org);
  if r.status <> 'accepted' then raise exception 'referral_closed' using errcode = '23514'; end if;
  if p_won and (p_commission_cents is null or p_commission_cents < 0) then raise exception 'referral_invalid' using errcode = '22023'; end if;
  update public.network_referrals
     set status = case when p_won then 'won'::public.referral_status else 'lost' end, closed_at = now(),
         commission_cents = case when p_won then p_commission_cents end,
         fee_cents = case when p_won then round(p_commission_cents * fee_pct / 100) end
   where id = r.id;
end $$;

-- De ontvanger meldt dat de vergoeding betaald is (of draait het terug)
create function public.referral_fee_paid(p_id uuid, p_paid boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.network_referrals;
begin
  select * into r from public.network_referrals where id = p_id;
  if r.id is null then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  perform public.net_guard(r.to_org);
  if r.status <> 'won' then raise exception 'referral_not_won' using errcode = '23514'; end if;
  update public.network_referrals set fee_paid_on = case when p_paid then current_date end where id = r.id;
end $$;

-- ---------------------------------------------------------------- samen een gedeeld pand verkopen
create function public.propose_collab(p_org uuid, p_share uuid, p_client text, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.property_shares;
  v_id uuid;
begin
  perform public.net_guard(p_org);
  select * into s from public.property_shares where id = p_share and partner_org = p_org;
  if s.id is null or not public.are_partners(s.org_id, p_org)
     or not exists (select 1 from public.properties where id = s.property_id and status = 'available') then
    raise exception 'collab_not_shared' using errcode = '23514';
  end if;
  insert into public.network_collabs (listing_org, partner_org, property_id, client_name, partner_share_pct, note, created_by)
  values (s.org_id, p_org, s.property_id, trim(p_client), coalesce(s.commission_pct, 50), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Het kantoor van het pand accepteert of weigert
create function public.respond_collab(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare c public.network_collabs;
begin
  select * into c from public.network_collabs where id = p_id;
  if c.id is null then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  perform public.net_guard(c.listing_org);
  if c.status <> 'proposed' then raise exception 'collab_closed' using errcode = '23514'; end if;
  update public.network_collabs set status = case when p_accept then 'accepted'::public.collab_status else 'declined' end where id = c.id;
end $$;

-- Een stap verder (of de bezichtiging plannen). Prijs en commissie zet het kantoor van het pand; betaald melden ook.
create function public.update_collab(p_id uuid, p_status public.collab_status, p_visit_at timestamptz default null,
  p_price_cents bigint default null, p_commission_cents bigint default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.network_collabs;
  mine uuid;
  listing boolean;
begin
  select * into c from public.network_collabs where id = p_id;
  if c.id is null then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  listing := public.is_member(c.listing_org);
  mine := case when listing then c.listing_org else c.partner_org end;
  perform public.net_guard(mine);
  if c.status in ('proposed', 'declined', 'cancelled', 'paid') then raise exception 'collab_closed' using errcode = '23514'; end if;
  if p_status in ('proposed', 'declined') then raise exception 'collab_invalid' using errcode = '22023'; end if;
  if (p_status = 'paid' or p_price_cents is not null or p_commission_cents is not null) and not listing then
    raise exception 'collab_listing_only' using errcode = '42501';
  end if;
  if p_status = 'paid' and coalesce(p_commission_cents, c.commission_cents) is null then
    raise exception 'collab_no_commission' using errcode = '23514';
  end if;
  update public.network_collabs
     set status = p_status,
         visit_at = coalesce(p_visit_at, visit_at),
         price_cents = coalesce(p_price_cents, price_cents),
         commission_cents = coalesce(p_commission_cents, commission_cents),
         paid_on = case when p_status = 'paid' then current_date else paid_on end
   where id = c.id;
end $$;

-- Alles voor de tabbladen van het Network, voor beide kantoren
create function public.network_work(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then raise exception 'You do not have permission to change this.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'referrals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'outgoing', r.from_org = p_org, 'office', o.name, 'office_whatsapp', o.public_whatsapp,
        'client_name', r.client_name, 'client_phone', case when r.from_org = p_org or r.status <> 'declined' then r.client_phone end,
        'purpose', r.purpose, 'city', r.city, 'property_types', r.property_types, 'budget_max_cents', r.budget_max_cents, 'note', r.note,
        'fee_pct', r.fee_pct, 'status', r.status, 'commission_cents', r.commission_cents, 'fee_cents', r.fee_cents, 'fee_paid_on', r.fee_paid_on,
        'created_at', r.created_at, 'lead_id', case when r.to_org = p_org then r.to_lead_id end) order by r.created_at desc)
      from public.network_referrals r join public.organizations o on o.id = case when r.from_org = p_org then r.to_org else r.from_org end
      where r.from_org = p_org or r.to_org = p_org), '[]'::jsonb),
    'collabs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'listing', c.listing_org = p_org, 'office', o.name, 'office_whatsapp', o.public_whatsapp, 'office_phone', o.public_phone,
        'reference', pr.reference, 'title', pr.title, 'city', pr.city, 'property_price_cents', pr.price_cents,
        'client_name', case when c.partner_org = p_org or c.status <> 'proposed' then c.client_name end,
        'partner_share_pct', c.partner_share_pct, 'status', c.status, 'visit_at', c.visit_at, 'price_cents', c.price_cents,
        'commission_cents', c.commission_cents, 'note', c.note, 'paid_on', c.paid_on, 'created_at', c.created_at,
        'property_id', case when c.listing_org = p_org then c.property_id end) order by c.updated_at desc)
      from public.network_collabs c join public.properties pr on pr.id = c.property_id
      join public.organizations o on o.id = case when c.listing_org = p_org then c.partner_org else c.listing_org end
      where c.listing_org = p_org or c.partner_org = p_org), '[]'::jsonb)
  );
end $$;

alter table public.network_referrals enable row level security;
alter table public.network_collabs enable row level security;
revoke all on table public.network_referrals, public.network_collabs from anon, authenticated;

revoke all on function public.net_guard(uuid) from public, anon, authenticated;
revoke all on function public.send_referral(uuid, uuid, text, text, public.deal_purpose, text, public.property_type[], bigint, text, numeric, boolean),
  public.respond_referral(uuid, boolean), public.close_referral(uuid, boolean, bigint), public.referral_fee_paid(uuid, boolean),
  public.propose_collab(uuid, uuid, text, text), public.respond_collab(uuid, boolean),
  public.update_collab(uuid, public.collab_status, timestamptz, bigint, bigint), public.network_work(uuid) from public, anon;
grant execute on function public.send_referral(uuid, uuid, text, text, public.deal_purpose, text, public.property_type[], bigint, text, numeric, boolean),
  public.respond_referral(uuid, boolean), public.close_referral(uuid, boolean, bigint), public.referral_fee_paid(uuid, boolean),
  public.propose_collab(uuid, uuid, text, text), public.respond_collab(uuid, boolean),
  public.update_collab(uuid, public.collab_status, timestamptz, bigint, bigint), public.network_work(uuid) to authenticated;
