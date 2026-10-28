-- Amplify Vastgoed, etappe 6e: leadformulier op de publieke pagina's, bron per lead, en bezoekcijfers
--
-- 1. Bron per lead (leads.source): waar de klant vandaan komt (WhatsApp, telefoon, binnenloper, publieke pagina,
--    Mubawab, Avito, Sarouty, Facebook, Instagram, doorverwezen, Amplify Network, andere). Mag leeg blijven.
-- 2. submit_inquiry(): een bezoeker van een publieke pagina laat naam, telefoon en een bericht achter. De database maakt
--    (of vindt) de persoon, maakt een lead met bron "public_page" en zet een taak "Rappeler ..." voor vandaag.
--    Bezoekers krijgen nog steeds geen toegang tot tabellen: alleen deze functie.
--    Bescherming tegen misbruik: een verborgen veld voor robots, controle op naam en nummer, hetzelfde nummer telt
--    maar een keer per 10 minuten, en hooguit 30 aanvragen per uur per kantoor.
-- 3. page_stats + log_page_event(): per dag en per pand het aantal bezoeken, klikken op WhatsApp, klikken op bellen en
--    formulieren. Geen persoonsgegevens, geen IP-adressen: alleen tellers. Voor het team en het eigenaarsrapport.

-- 1. Bron per lead -----------------------------------------------------------------------------------------
create type public.lead_source as enum
  ('whatsapp', 'phone', 'walk_in', 'public_page', 'mubawab', 'avito', 'sarouty', 'facebook', 'instagram', 'referral', 'network', 'other');

alter table public.leads add column source public.lead_source;
create index leads_org_source_idx on public.leads (org_id, source, created_at);

-- 3. Bezoekcijfers (eerst, want submit_inquiry telt mee) ---------------------------------------------------
create table public.page_stats (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id),
  property_id uuid,
  day         date not null default current_date,
  views       integer not null default 0,
  whatsapp    integer not null default 0,
  calls       integer not null default 0,
  forms       integer not null default 0,
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create unique index page_stats_day_idx on public.page_stats
  (org_id, (coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid)), day);

create function public.bump_page_stat(p_org uuid, p_property uuid, p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.page_stats (org_id, property_id, day, views, whatsapp, calls, forms)
  values (p_org, p_property, current_date,
          (p_kind = 'view')::int, (p_kind = 'whatsapp')::int, (p_kind = 'call')::int, (p_kind = 'form')::int)
  on conflict (org_id, (coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid)), day) do update
    set views = page_stats.views + excluded.views,
        whatsapp = page_stats.whatsapp + excluded.whatsapp,
        calls = page_stats.calls + excluded.calls,
        forms = page_stats.forms + excluded.forms;
end $$;

-- Het pand achter een publieke link, alleen als die pagina echt online staat (zelfde regels als public_property_page)
create function public.public_property_id(p_org uuid, p_reference text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.properties
  where org_id = p_org and lower(reference) = lower(trim(p_reference))
    and is_published and status in ('available', 'reserved', 'rented', 'sold')
    and public.mandate_is_active(id)
$$;

-- Een bezoek of klik op een publieke pagina tellen. p_reference leeg = de kantoorpagina.
create function public.log_page_event(p_slug text, p_reference text, p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  p uuid;
begin
  if p_kind not in ('view', 'whatsapp', 'call') then
    return;
  end if;
  select id into o from public.organizations where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if o is null then
    return;
  end if;
  if coalesce(trim(p_reference), '') <> '' then
    p := public.public_property_id(o, p_reference);
    if p is null then
      return;
    end if;
  end if;
  perform public.bump_page_stat(o, p, p_kind);
end $$;

alter table public.page_stats enable row level security;
create policy page_stats_select on public.page_stats
  for select to authenticated using (public.is_member(org_id));
revoke all on table public.page_stats from anon, authenticated;
grant select on public.page_stats to authenticated;

-- 2. Aanvraag via de publieke pagina ------------------------------------------------------------------------
create function public.submit_inquiry(
  p_slug text, p_reference text, p_name text, p_phone text, p_message text,
  p_purpose text default null, p_trap text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o       public.organizations;
  pr      public.properties;
  v_name  text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 120);
  v_phone text := left(trim(coalesce(p_phone, '')), 40);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail  text;
  v_msg   text := nullif(left(trim(coalesce(p_message, '')), 1000), '');
  v_purpose public.deal_purpose;
  v_person uuid;
  v_lead  uuid;
  v_note  text;
begin
  -- Robots vullen het verborgen veld in: doe alsof het gelukt is, maar bewaar niets.
  if coalesce(p_trap, '') <> '' then
    return true;
  end if;
  if char_length(v_name) < 2 or char_length(v_digits) not between 8 and 15 then
    raise exception 'inquiry_invalid' using errcode = '22023';
  end if;
  v_tail := right(v_digits, 9);

  select * into o from public.organizations where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if o.id is null then
    raise exception 'inquiry_invalid' using errcode = '22023';
  end if;
  if coalesce(trim(p_reference), '') <> '' then
    select * into pr from public.properties where id = public.public_property_id(o.id, p_reference);
  end if;

  if (select count(*) from public.leads where org_id = o.id and source = 'public_page'
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'inquiry_busy' using errcode = '54000';
  end if;

  -- De persoon: zelfde nummer (laatste 9 cijfers) in dit kantoor, anders nieuw
  select id into v_person from public.people
  where org_id = o.id
    and (right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_tail
      or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail)
  order by created_at limit 1;

  -- Twee keer op verzenden gedrukt: niets dubbel
  if v_person is not null and exists (
       select 1 from public.leads where person_id = v_person and source = 'public_page' and created_at > now() - interval '10 minutes') then
    return true;
  end if;

  if v_person is null then
    insert into public.people (org_id, full_name, phone, whatsapp, notes)
    values (o.id, v_name, v_phone, v_phone, 'Via la page publique')
    returning id into v_person;
  end if;

  v_purpose := coalesce(pr.purpose,
    case when p_purpose in ('sale', 'rent_long', 'rent_short') then p_purpose::public.deal_purpose else 'sale' end);
  v_note := 'Demande via la page publique'
    || case when pr.id is not null then ' pour ' || pr.title || ' (' || pr.reference || ')' else '' end
    || ' le ' || to_char(now() at time zone 'Africa/Casablanca', 'DD/MM/YYYY HH24:MI')
    || coalesce(E' :\n' || v_msg, '');

  -- Een lopende lead met hetzelfde doel krijgt de vraag erbij; anders een nieuwe lead
  select id into v_lead from public.leads
  where person_id = v_person and purpose = v_purpose and status in ('new', 'active', 'viewing')
  order by created_at desc limit 1;
  if v_lead is not null then
    update public.leads set notes = left(coalesce(notes || E'\n\n', '') || v_note, 4000) where id = v_lead;
  else
    insert into public.leads (org_id, person_id, purpose, status, source, property_types, city, neighborhoods, notes)
    values (o.id, v_person, v_purpose, 'new', 'public_page',
            case when pr.id is not null then array[pr.property_type] else '{}' end,
            coalesce(pr.city, o.city),
            case when pr.neighborhood is not null then array[pr.neighborhood] else '{}' end,
            v_note)
    returning id into v_lead;
  end if;

  insert into public.tasks (org_id, title, notes, due_date, lead_id, property_id)
  values (o.id, left('Rappeler ' || v_name || ' (demande en ligne)', 200), v_msg, current_date, v_lead, pr.id);

  perform public.bump_page_stat(o.id, pr.id, 'form');
  return true;
end $$;

revoke all on function public.bump_page_stat(uuid, uuid, text), public.public_property_id(uuid, text) from public, anon, authenticated;
revoke all on function public.log_page_event(text, text, text), public.submit_inquiry(text, text, text, text, text, text, text) from public;
grant execute on function public.log_page_event(text, text, text) to anon, authenticated;
grant execute on function public.submit_inquiry(text, text, text, text, text, text, text) to anon, authenticated;
