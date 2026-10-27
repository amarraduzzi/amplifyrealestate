-- Amplify Vastgoed, etappe 1k: automatische taak "Verleng het mandaat" bij een bijna verlopen of verlopen mandaat
--
-- Ontwerpkeuzes:
--  * Geen planner nodig: de desk roept sync_mandate_tasks aan als iemand van het team het scherm Today opent.
--    De functie maakt alleen taken aan die er nog niet zijn, dus vaak aanroepen kan geen kwaad.
--  * Een pand dat beschikbaar of gereserveerd is, krijgt een taak als zijn laatste geldige mandaat binnen 30 dagen
--    afloopt (deadline: 14 dagen voor het einde, nooit in het verleden), of als het mandaat al verlopen is
--    en er geen ander geldig mandaat is (deadline: vandaag). Een mandaat zonder einddatum loopt nooit af.
--  * Elke automatische taak heeft een sleutel (mandaat + einddatum). Sluit je de taak, dan komt hij niet terug.
--    Wordt het mandaat verlengd (nieuwe einddatum) en loopt dat later weer af, dan komt er wel een nieuwe taak.
--  * De taak is van niemand (assigned_to leeg) en hangt aan het pand; de titel komt uit de taal van de desk.

alter table public.tasks
  add column auto_key text check (auto_key is null or char_length(auto_key) <= 100);
create unique index tasks_auto_key_idx on public.tasks (org_id, auto_key) where auto_key is not null;

create function public.sync_mandate_tasks(p_org uuid, p_label text default 'Renew mandate')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_label text := coalesce(nullif(trim(p_label), ''), 'Renew mandate');
  v_n     integer;
begin
  if not public.can_write(p_org) then
    raise exception 'geen_toegang' using errcode = '42501';
  end if;

  with props as (
    select p.id, p.title, p.reference
    from public.properties p
    where p.org_id = p_org and p.status in ('available', 'reserved')
  ),
  valid as (
    select m.property_id, m.id, m.valid_until
    from public.property_mandates m
    where m.org_id = p_org and m.status = 'active'
      and (m.valid_until is null or m.valid_until >= current_date)
  ),
  ending as (
    select distinct on (v.property_id) v.property_id, v.id as mandate_id, v.valid_until
    from valid v
    where not exists (select 1 from valid v2 where v2.property_id = v.property_id and v2.valid_until is null)
    order by v.property_id, v.valid_until desc
  ),
  ended as (
    select distinct on (m.property_id) m.property_id, m.id as mandate_id, m.valid_until
    from public.property_mandates m
    where m.org_id = p_org
      and (m.status = 'expired' or (m.status = 'active' and m.valid_until < current_date))
      and not exists (select 1 from valid v where v.property_id = m.property_id)
    order by m.property_id, m.valid_until desc nulls last
  ),
  cand as (
    select property_id, mandate_id, valid_until, greatest(valid_until - 14, current_date) as due
    from ending where valid_until <= current_date + 30
    union all
    select property_id, mandate_id, valid_until, current_date from ended
  )
  insert into public.tasks (org_id, title, due_date, property_id, auto_key)
  select p_org,
         left(v_label || ': ' || pr.title || ' (' || pr.reference || ')', 200),
         c.due,
         c.property_id,
         'mandate:' || c.mandate_id || ':' || coalesce(c.valid_until::text, 'none')
  from cand c
  join props pr on pr.id = c.property_id
  on conflict (org_id, auto_key) where auto_key is not null do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.sync_mandate_tasks(uuid, text) from public, anon;
grant execute on function public.sync_mandate_tasks(uuid, text) to authenticated;
