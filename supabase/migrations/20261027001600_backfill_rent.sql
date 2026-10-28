-- Amplify Vastgoed, etappe 4c: eerdere huurmaanden achteraf invullen
--
-- Voor een huurovereenkomst die al liep voordat hij in de app kwam. generate_rent_due() maakt maandhuren pas aan vanaf
-- de dag dat de overeenkomst in de app staat; met backfill_rent() vul je de maanden daarvoor in.
--
-- Regels:
--  * Je kiest een startdatum (niet voor het begin van de overeenkomst) en of die maanden al betaald zijn.
--  * Elke maand krijgt een regel op de betaaldag (payment_day), tot en met vandaag, en nooit na de einddatum of de dag
--    waarop de overeenkomst eindigde.
--  * Maanden die er al staan blijven ongemoeid (ook hun status).
--  * Betaald: status paid met als betaaldatum de vervaldatum. Niet betaald: status due, dus zichtbaar als achterstand.
--  * Maximaal 60 nieuwe maanden per keer, de meest recente eerst. Nog verder terug? Nog eens klikken vult de
--    volgende 60 maanden aan.
--  * Alleen eigenaar, manager en agent, en niet na afloop van het plan (can_write).
-- Geeft het aantal toegevoegde maanden terug.
-- Mag opnieuw gedraaid worden: een eerdere versie van deze functie wordt vervangen.

drop function if exists public.backfill_rent(uuid, date, boolean);
create function public.backfill_rent(p_lease uuid, p_from date, p_paid boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l       record;
  d       date;
  last_d  date;
  n       integer := 0;
  c       integer;
begin
  select * into l from public.leases where id = p_lease;
  if l.id is not null and public.is_member(l.org_id) and not public.org_is_open(l.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if l.id is null or not public.can_write(l.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if p_from is null then
    return 0;
  end if;

  last_d := least(current_date, coalesce(l.end_date, current_date), coalesce(l.ended_on, current_date));

  -- de laatste betaaldag op of voor last_d
  d := make_date(extract(year from last_d)::int, extract(month from last_d)::int, l.payment_day);
  if d > last_d then
    d := (d - interval '1 month')::date;
  end if;

  -- terug in de tijd, tot de startdatum (en nooit voor het begin van de overeenkomst)
  while d >= greatest(p_from, l.start_date) and n < 60 loop
    insert into public.rent_payments (org_id, lease_id, due_date, amount_cents, status, paid_on)
    values (l.org_id, l.id, d, l.rent_cents,
            case when p_paid then 'paid'::public.rent_payment_status else 'due'::public.rent_payment_status end,
            case when p_paid then d end)
    on conflict (lease_id, due_date) do nothing;
    get diagnostics c = row_count;
    n := n + c;
    d := (d - interval '1 month')::date;
  end loop;
  return n;
end $$;

revoke all on function public.backfill_rent(uuid, date, boolean) from public, anon;
grant execute on function public.backfill_rent(uuid, date, boolean) to authenticated;
