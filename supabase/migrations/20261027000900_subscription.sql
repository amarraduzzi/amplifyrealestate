-- Amplify Vastgoed, etappe 1l: plan (proefperiode en betaald abonnement) per kantoor
--
-- Ontwerpkeuzes:
--  * Elk kantoor heeft een plan: 'trial' (30 dagen gratis, alle functies) of 'active' (betaald), met een laatste dag
--    (plan_until). Bestaande kantoren krijgen vandaag + 30 dagen als proefperiode.
--  * Na de laatste dag is het kantoor alleen-lezen: kijken en exporteren kan, wijzigen niet. Er gaat niets verloren
--    en de publieke pandpagina's blijven online. Dit loopt via can_write(), dus alle bestaande regels
--    (panden, personen, leads, bezichtigingen, taken, foto's) volgen vanzelf.
--  * Limieten per kantoor (max_members, max_properties): nieuwe leden en nieuwe (of weer actieve) panden boven de
--    limiet worden geweigerd. Wat er al is, blijft staan. De waarden hieronder zijn voorlopig; pas ze per kantoor aan.
--  * Geen automatische betaling: jij zet een kantoor op actief met activate_plan() in de SQL-editor,
--    bijvoorbeeld:  select public.activate_plan('mijn-kantoor', '2027-11-30');
--    Klanten kunnen hun eigen plan nooit wijzigen (geen schrijfrechten op deze kolommen).

alter table public.organizations
  add column plan           text    not null default 'trial' check (plan in ('trial', 'active')),
  add column plan_until     date    not null default (current_date + 30),
  add column max_members    integer not null default 5   check (max_members >= 1),
  add column max_properties integer not null default 100 check (max_properties >= 1);

-- Is het kantoor nog open voor wijzigingen? (laatste dag telt nog mee)
create function public.org_is_open(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan_until >= current_date from public.organizations where id = p_org), false)
$$;

-- Schrijfrecht: rol (eigenaar, manager, agent) EN het kantoor is open
create or replace function public.can_write(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'manager', 'agent')
  ) and public.org_is_open(p_org)
$$;

-- Personen verwijderen mag ook alleen nog als het kantoor open is
drop policy people_delete on public.people;
create policy people_delete on public.people
  for delete to authenticated using (public.can_manage(org_id) and public.org_is_open(org_id));

-- Limieten: leden
create function public.memberships_plan_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o public.organizations;
begin
  -- een rol wijzigen van iemand die al lid is, is geen nieuw lid
  if exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.user_id) then
    return new;
  end if;
  select * into o from public.organizations where id = new.org_id;
  if not found then return new; end if;
  if o.plan_until < current_date then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if (select count(*) from public.memberships where org_id = new.org_id) >= o.max_members then
    raise exception 'plan_limit_members' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger memberships_plan_guard before insert on public.memberships
  for each row execute function public.memberships_plan_guard();

-- Limieten: panden (ingetrokken panden tellen niet mee)
create function public.properties_plan_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
begin
  if tg_op = 'UPDATE' and not (old.status = 'withdrawn' and new.status <> 'withdrawn') then
    return new;
  end if;
  if new.status = 'withdrawn' then
    return new;
  end if;
  select max_properties into v_max from public.organizations where id = new.org_id;
  if v_max is not null
     and (select count(*) from public.properties where org_id = new.org_id and status <> 'withdrawn') >= v_max then
    raise exception 'plan_limit_properties' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger properties_plan_guard before insert or update of status on public.properties
  for each row execute function public.properties_plan_guard();

-- Wat de desk toont: plan, dagen over en gebruik tegenover de limieten
create function public.org_plan(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.organizations;
begin
  if not public.is_member(p_org) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = p_org;
  return jsonb_build_object(
    'plan', o.plan,
    'plan_until', o.plan_until,
    'days_left', o.plan_until - current_date,
    'is_open', o.plan_until >= current_date,
    'max_members', o.max_members,
    'max_properties', o.max_properties,
    'members', (select count(*) from public.memberships where org_id = p_org),
    'properties', (select count(*) from public.properties where org_id = p_org and status <> 'withdrawn')
  );
end $$;

-- Alleen voor jou in de SQL-editor: kantoor op betaald zetten (of verlengen)
create function public.activate_plan(p_slug text, p_until date, p_max_members integer default null, p_max_properties integer default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.organizations;
begin
  if p_until is null or p_until < current_date then
    raise exception 'einddatum_in_het_verleden' using errcode = '22023';
  end if;
  update public.organizations
     set plan = 'active',
         plan_until = p_until,
         max_members = coalesce(p_max_members, max_members),
         max_properties = coalesce(p_max_properties, max_properties)
   where slug = lower(trim(p_slug))
  returning * into o;
  if not found then
    raise exception 'kantoor_niet_gevonden' using errcode = 'P0002';
  end if;
  return o.name || ': active tot ' || o.plan_until || ' (max ' || o.max_members || ' leden, ' || o.max_properties || ' panden)';
end $$;

revoke all on function public.org_is_open(uuid) from public, anon;
grant execute on function public.org_is_open(uuid) to authenticated;
revoke all on function public.org_plan(uuid) from public, anon;
grant execute on function public.org_plan(uuid) to authenticated;
revoke all on function public.activate_plan(text, date, integer, integer) from public, anon, authenticated;
revoke all on function public.memberships_plan_guard(), public.properties_plan_guard() from public, anon, authenticated;
