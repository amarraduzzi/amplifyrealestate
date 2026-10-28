-- Amplify Vastgoed, etappe 6c: nieuwe matches op Today
--
-- Komt er een pand beschikbaar dat past bij een lead die nog zoekt, dan toont Today dat als "Nieuwe matches",
-- per lead, met een knop om de panden via WhatsApp te sturen of de match over te slaan. Het passen zelf berekent de
-- app (zoals al bij een lead); deze tabel onthoudt alleen wat het team ermee gedaan heeft, zodat een match niet
-- steeds terugkomt en het hele team hetzelfde ziet.
--
-- Regels:
--  * Per lead en pand een regel: sent (gestuurd) of dismissed (overgeslagen). Nog eens markeren overschrijft.
--  * Sturen telt ook als contact met de lead (last_contact_at wordt nu).
--  * Alleen eigenaar, manager en agent, niet na afloop van het plan (can_write). Lezen: alle leden.
--  * Lead en panden moeten van hetzelfde kantoor zijn.

create type public.match_notice_status as enum ('sent', 'dismissed');

create table public.match_notices (
  org_id      uuid not null references public.organizations(id),
  lead_id     uuid not null,
  property_id uuid not null,
  status      public.match_notice_status not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (lead_id, property_id),
  foreign key (lead_id, org_id)     references public.leads (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index match_notices_org_idx on public.match_notices (org_id);

-- Matches markeren als gestuurd of overgeslagen. Geeft het aantal gemarkeerde panden terug.
create function public.mark_matches(p_lead uuid, p_properties uuid[], p_status public.match_notice_status)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  n integer;
begin
  select org_id into o from public.leads where id = p_lead;
  if o is not null and public.is_member(o) and not public.org_is_open(o) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  insert into public.match_notices (org_id, lead_id, property_id, status, created_by)
  select o, p_lead, p.id, p_status, auth.uid()
  from public.properties p
  where p.id = any(coalesce(p_properties, '{}')) and p.org_id = o
  on conflict (lead_id, property_id) do update
    set status = excluded.status, created_by = excluded.created_by, created_at = now();
  get diagnostics n = row_count;
  if p_status = 'sent' and n > 0 then
    update public.leads set last_contact_at = clock_timestamp() where id = p_lead;
  end if;
  return n;
end $$;

alter table public.match_notices enable row level security;
create policy match_notices_select on public.match_notices
  for select to authenticated using (public.is_member(org_id));

revoke all on table public.match_notices from anon, authenticated;
grant select on public.match_notices to authenticated;

revoke all on function public.mark_matches(uuid, uuid[], public.match_notice_status) from public, anon;
grant execute on function public.mark_matches(uuid, uuid[], public.match_notice_status) to authenticated;
