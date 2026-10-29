-- Amplify Vitrine: alerte WhatsApp ("Prévenez-moi des nouveaux biens")
--
-- Een bezoeker laat op de site zijn zoekopdracht en WhatsApp-nummer achter. Dat wordt een gewone lead met
-- criteria (bron public_page) en een vlag wants_alerts. De desk toont zo'n lead bij elk nieuw passend pand
-- met een knop om het pand meteen via WhatsApp te sturen, in de taal van de bezoeker.

alter table public.leads add column wants_alerts boolean not null default false;
alter table public.leads add column alert_lang text check (alert_lang is null or alert_lang in ('fr', 'ar', 'en'));

create function public.submit_alert(
  p_slug text, p_name text, p_phone text, p_purpose text, p_type text default null, p_neighborhood text default null,
  p_min text default null, p_max text default null, p_beds text default null, p_area text default null,
  p_lang text default null, p_trap text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o        public.organizations;
  v_name   text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 120);
  v_phone  text := left(trim(coalesce(p_phone, '')), 40);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail   text;
  v_purpose public.deal_purpose;
  v_type   public.property_type;
  v_hood   text := nullif(left(trim(coalesce(p_neighborhood, '')), 80), '');
  v_min    bigint; v_max bigint; v_beds smallint; v_area numeric;
  v_lang   text := case when p_lang in ('fr', 'ar', 'en') then p_lang else 'fr' end;
  v_person uuid;
  v_lead   uuid;
  v_note   text;
begin
  if coalesce(p_trap, '') <> '' then
    return true;
  end if;
  if char_length(v_name) < 2 or char_length(v_digits) not between 8 and 15
     or coalesce(p_purpose, '') not in ('sale', 'rent_long', 'rent_short') then
    raise exception 'alert_invalid' using errcode = '22023';
  end if;
  v_tail := right(v_digits, 9);
  v_purpose := p_purpose::public.deal_purpose;
  if coalesce(p_type, '') <> '' then
    begin v_type := p_type::public.property_type;
    exception when others then raise exception 'alert_invalid' using errcode = '22023'; end;
  end if;
  -- bedragen komen in dirham binnen, de database rekent in centimes
  begin
    v_min  := case when coalesce(p_min, '')  ~ '^\d{1,10}$' then p_min::bigint * 100 end;
    v_max  := case when coalesce(p_max, '')  ~ '^\d{1,10}$' then p_max::bigint * 100 end;
    v_beds := case when coalesce(p_beds, '') ~ '^\d{1,2}$' and p_beds::int > 0 then p_beds::smallint end;
    v_area := case when coalesce(p_area, '') ~ '^\d{1,5}$' and p_area::int > 0 then p_area::numeric end;
  end;
  if v_min is not null and v_max is not null and v_max < v_min then
    v_max := null;
  end if;

  select * into o from public.organizations where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if o.id is null then
    raise exception 'alert_invalid' using errcode = '22023';
  end if;

  if (select count(*) from public.leads where org_id = o.id and source = 'public_page'
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'inquiry_busy' using errcode = '54000';
  end if;

  select id into v_person from public.people
  where org_id = o.id
    and (right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_tail
      or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail)
  order by created_at limit 1;

  -- twee keer op verzenden gedrukt: niets dubbel
  if v_person is not null and exists (
       select 1 from public.leads where person_id = v_person and wants_alerts and created_at > now() - interval '10 minutes') then
    return true;
  end if;
  -- niet meer dan 5 lopende alertes per persoon
  if v_person is not null and (select count(*) from public.leads where person_id = v_person and wants_alerts
                                 and status in ('new', 'active', 'viewing')) >= 5 then
    return true;
  end if;

  if v_person is null then
    insert into public.people (org_id, full_name, phone, whatsapp, notes)
    values (o.id, v_name, v_phone, v_phone, 'Via la page publique')
    returning id into v_person;
  end if;

  v_note := 'Alerte WhatsApp créée sur le site le '
    || to_char(now() at time zone 'Africa/Casablanca', 'DD/MM/YYYY HH24:MI')
    || '. Envoyez-lui chaque nouveau bien qui correspond.';

  insert into public.leads (org_id, person_id, purpose, status, source, property_types, city, neighborhoods,
                            budget_min_cents, budget_max_cents, min_bedrooms, min_area_m2, notes, wants_alerts, alert_lang)
  values (o.id, v_person, v_purpose, 'new', 'public_page',
          case when v_type is not null then array[v_type] else '{}' end, null,
          case when v_hood is not null then array[v_hood] else '{}' end,
          v_min, v_max, v_beds, v_area, v_note, true, v_lang)
  returning id into v_lead;

  insert into public.tasks (org_id, title, notes, due_date, lead_id)
  values (o.id, left('Souhaiter la bienvenue à ' || v_name || ' (alerte WhatsApp)', 200),
          'Nouvelle alerte sur le site. Envoyez-lui déjà les biens qui correspondent.', current_date, v_lead);

  perform public.bump_page_stat(o.id, null, 'form');
  return true;
end $$;

revoke all on function public.submit_alert(text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_alert(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
