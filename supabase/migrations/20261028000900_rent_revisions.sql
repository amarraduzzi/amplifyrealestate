-- Amplify Vastgoed, etappe 7d: huurverhoging (révision du loyer) en quittances
--
-- Quittances (huurkwitanties) maakt de app uit de betaalde maanden: daar is geen nieuwe tabel voor nodig.
--
-- Huurverhoging volgens de Marokkaanse wet (loi 07-03, en artikelen 31 en 34 van loi 67-12):
--  * pas drie jaar na het begin van de huur of na de vorige verhoging;
--  * hooguit 8% voor bewoning (appartement, villa, riad, huis) en 10% voor ander gebruik (winkel, kantoor, ...).
-- revise_rent() controleert beide, legt de verhoging vast in rent_revisions en past de huur aan. Maandhuren die al
-- klaarstaan en nog niet betaald zijn, krijgen het nieuwe bedrag (zie leases_sync_payments in 3b).
-- Een verlaging mag altijd.

create table public.rent_revisions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  lease_id      uuid not null,
  effective_on  date not null default current_date,
  old_cents     bigint not null check (old_cents > 0),
  new_cents     bigint not null check (new_cents > 0),
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (lease_id, org_id) references public.leases (id, org_id)
);
create index rent_revisions_lease_idx on public.rent_revisions (lease_id, effective_on desc);

-- Wanneer mag de huur weer omhoog, en met hoeveel procent? { "next": datum, "max_pct": 8 of 10, "allowed": bool }
create function public.rent_revision_rule(p_lease uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'next', (greatest(l.start_date, coalesce((select max(r.effective_on) from public.rent_revisions r where r.lease_id = l.id and r.new_cents > r.old_cents), l.start_date)) + interval '3 years')::date,
    'max_pct', case when p.property_type in ('apartment', 'villa', 'riad', 'house') then 8 else 10 end,
    'allowed', (greatest(l.start_date, coalesce((select max(r.effective_on) from public.rent_revisions r where r.lease_id = l.id and r.new_cents > r.old_cents), l.start_date)) + interval '3 years')::date <= current_date)
  from public.leases l join public.properties p on p.id = l.property_id
  where l.id = p_lease and public.is_member(l.org_id)
$$;

create function public.revise_rent(p_lease uuid, p_new_cents bigint, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  l    public.leases;
  rule jsonb;
begin
  select * into l from public.leases where id = p_lease;
  if l.id is not null and public.is_member(l.org_id) and not public.org_is_open(l.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if l.id is null or not public.can_write(l.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if l.status <> 'active' then
    raise exception 'rent_revision_lease_ended' using errcode = '23514';
  end if;
  if p_new_cents is null or p_new_cents <= 0 or p_new_cents = l.rent_cents then
    raise exception 'rent_revision_invalid' using errcode = '22023';
  end if;
  rule := public.rent_revision_rule(p_lease);
  if p_new_cents > l.rent_cents then
    if not (rule->>'allowed')::boolean then
      raise exception 'rent_revision_too_soon' using errcode = '23514';
    end if;
    if p_new_cents > floor(l.rent_cents * (1 + (rule->>'max_pct')::numeric / 100)) then
      raise exception 'rent_revision_too_high' using errcode = '23514';
    end if;
  end if;
  insert into public.rent_revisions (org_id, lease_id, old_cents, new_cents, note, created_by)
  values (l.org_id, l.id, l.rent_cents, p_new_cents, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  update public.leases set rent_cents = p_new_cents where id = l.id;
end $$;

alter table public.rent_revisions enable row level security;
create policy rent_revisions_select on public.rent_revisions
  for select to authenticated using (public.is_member(org_id));
revoke all on table public.rent_revisions from anon, authenticated;
grant select on public.rent_revisions to authenticated;

revoke all on function public.rent_revision_rule(uuid), public.revise_rent(uuid, bigint, text) from public, anon;
grant execute on function public.rent_revision_rule(uuid), public.revise_rent(uuid, bigint, text) to authenticated;
