-- Amplify Vastgoed, etappe 3b: huurbetalingen (te betalen en betaald, per maand per huurovereenkomst)
--
-- Zelfde regels als de rest: elke rij hoort bij een organisatie, niets wordt verwijderd, verwijzen over organisaties
-- heen kan niet, en na afloop van het plan is het alleen-lezen (can_write).
--
-- Ontwerpkeuzes:
--  * Een rij is een maandhuur die betaald moet worden, met een status: due (te betalen), paid (betaald) of cancelled
--    (vervallen doordat de overeenkomst eerder eindigde). Te laat is geen status maar volgt uit: due en de vervaldatum is voorbij.
--  * De rijen worden niet door gebruikers aangemaakt maar door generate_rent_due(). Die maakt voor elke lopende overeenkomst
--    de maandhuren aan op de betaaldag (payment_day), tot 31 dagen vooruit en nooit na de einddatum. Het is veilig om hem
--    vaak aan te roepen: bestaande rijen blijven ongemoeid. De desk roept hem aan bij het openen van Rentals.
--  * Betalingen worden bijgehouden vanaf de dag dat de overeenkomst in de app is aangemaakt, niet met terugwerkende kracht:
--    een huurovereenkomst die al jaren loopt krijgt dus geen tientallen verlopen maanden.
--  * Bedrag en vervaldatum staan vast voor de gebruiker; die kan alleen de status, de betaaldatum, een notitie en de datum van
--    de laatste herinnering wijzigen. Verandert de huur van de overeenkomst, dan krijgen de nog niet verlopen, onbetaalde
--    maanden het nieuwe bedrag; verlopen en betaalde maanden blijven zoals afgesproken.
--  * Eindigt een overeenkomst, dan vervallen de onbetaalde maanden na de einddatum; wat al verlopen is blijft openstaan.
--    Heropen je de overeenkomst, dan worden de vervallen maanden weer te betalen.

create type public.rent_payment_status as enum ('due', 'paid', 'cancelled');

create table public.rent_payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  lease_id      uuid not null,
  due_date      date not null,
  amount_cents  bigint not null check (amount_cents > 0),
  status        public.rent_payment_status not null default 'due',
  paid_on       date,
  note          text,
  reminded_on   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (lease_id, due_date),
  foreign key (lease_id, org_id) references public.leases (id, org_id),
  check ((status = 'paid') = (paid_on is not null))
);
create index rent_payments_org_status_idx on public.rent_payments (org_id, status, due_date);
create index rent_payments_lease_idx      on public.rent_payments (lease_id);

comment on column public.rent_payments.amount_cents is 'In centimes: de huur van deze maand.';

-- paid_on volgt de status: gevuld (standaard vandaag) bij betaald, anders leeg
create function public.rent_payments_set_paid()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' then
    new.paid_on := coalesce(new.paid_on, current_date);
  else
    new.paid_on := null;
  end if;
  return new;
end $$;

create trigger rent_payments_touch    before update on public.rent_payments
  for each row execute function public.touch_updated_at();
create trigger rent_payments_org_lock before update on public.rent_payments
  for each row execute function public.forbid_org_change();
create trigger rent_payments_set_paid before insert or update on public.rent_payments
  for each row execute function public.rent_payments_set_paid();

-- Maandhuren aanmaken voor de lopende overeenkomsten van een kantoor. Geeft het aantal nieuwe rijen terug.
create function public.generate_rent_due(p_org uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l         record;
  d         date;
  first_due date;
  last_due  date;
  n         integer := 0;
  c         integer;
begin
  if not public.can_write(p_org) then
    return 0;
  end if;
  for l in select * from public.leases where org_id = p_org and status = 'active' loop
    d := greatest(l.start_date, l.created_at::date);
    first_due := make_date(extract(year from d)::int, extract(month from d)::int, l.payment_day);
    if first_due < d then
      first_due := (first_due + interval '1 month')::date;
    end if;
    last_due := least(coalesce(l.end_date, current_date + 31), current_date + 31);
    d := first_due;
    while d <= last_due loop
      insert into public.rent_payments (org_id, lease_id, due_date, amount_cents)
      values (p_org, l.id, d, l.rent_cents)
      on conflict (lease_id, due_date) do nothing;
      get diagnostics c = row_count;
      n := n + c;
      d := (d + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end $$;

-- Gevolgen van een gewijzigde overeenkomst voor de betalingen
create function public.leases_sync_payments()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and old.status = 'active' then
    update public.rent_payments set status = 'cancelled'
    where lease_id = new.id and status = 'due' and due_date > coalesce(new.ended_on, current_date);
  elsif new.status = 'active' and old.status = 'ended' then
    update public.rent_payments set status = 'due'
    where lease_id = new.id and status = 'cancelled';
  end if;
  if new.rent_cents <> old.rent_cents then
    update public.rent_payments set amount_cents = new.rent_cents
    where lease_id = new.id and status = 'due' and due_date > current_date;
  end if;
  return null;
end $$;

create trigger leases_sync_payments after update of status, rent_cents on public.leases
  for each row execute function public.leases_sync_payments();

alter table public.rent_payments enable row level security;

create policy rent_payments_select on public.rent_payments
  for select to authenticated using (public.is_member(org_id));
create policy rent_payments_update on public.rent_payments
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.rent_payments from anon, authenticated;
grant select on public.rent_payments to authenticated;
grant update (status, paid_on, note, reminded_on) on public.rent_payments to authenticated;

revoke all on function public.rent_payments_set_paid(), public.leases_sync_payments() from public, anon, authenticated;
revoke all on function public.generate_rent_due(uuid) from public, anon;
grant execute on function public.generate_rent_due(uuid) to authenticated;
