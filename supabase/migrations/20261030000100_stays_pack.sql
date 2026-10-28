-- Amplify Vastgoed, etappe 12b: Airbnb-pakket
--
--  1. iCal-import: per woning een of meer agenda-links van Airbnb, Booking of een ander kanaal. Het kantoor haalt ze op
--     (de desk laat de worker de link ophalen) en de database zet de bezette data als boekingen in de planning.
--     Geen dubbele boekingen: een dag die al bezet is door een andere boeking wordt niet overschreven maar gemeld.
--     Verdwijnt een boeking uit de agenda van het kanaal, dan wordt hij hier geannuleerd.
--  2. Gastenpagina per woning (/g/<code>): aankomst, wifi, regels, tips en WhatsApp-knop, in FR, AR, EN of NL.
--  3. Schoonmaakpersoon zonder account (/c/<code>): ziet alleen de ménage-taken van zijn woningen, vinkt "klaar" af met
--     een opmerking en een foto als bewijs.
--  4. Taal van de gast per boeking (voor de berichtsjablonen).

alter table public.stays
  add column guest_lang   text    not null default 'fr' check (guest_lang in ('fr', 'ar', 'en', 'nl')),
  add column external_uid text    check (external_uid is null or char_length(external_uid) <= 200),
  add column is_block     boolean not null default false,
  add column feed_id      uuid;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. iCal-agenda's van de kanalen
-- ---------------------------------------------------------------------------------------------------------------
create table public.ical_feeds (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  property_id    uuid not null,
  channel        public.stay_channel not null default 'airbnb',
  url            text not null check (char_length(url) between 12 and 1000 and url ~ '^https://'),
  last_synced_at timestamptz,
  last_status    text check (last_status is null or char_length(last_status) <= 200),
  last_count     integer not null default 0,
  last_conflicts jsonb not null default '[]'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (id, org_id),
  unique (property_id, url),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index ical_feeds_org_idx on public.ical_feeds (org_id, property_id);

alter table public.stays add constraint stays_feed_fk foreign key (feed_id) references public.ical_feeds (id) on delete set null;
create unique index stays_feed_uid_idx on public.stays (feed_id, external_uid) where feed_id is not null and external_uid is not null;

create trigger ical_feeds_by before insert on public.ical_feeds for each row execute function public.set_created_by();

create function public.ical_feeds_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.property_id <> old.property_id then
    raise exception 'stay_fixed_property' using errcode = '23514';
  end if;
  if not exists (select 1 from public.properties where id = new.property_id and purpose = 'rent_short') then
    raise exception 'stay_not_short_term' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger ical_feeds_guard before insert or update on public.ical_feeds for each row execute function public.ical_feeds_guard();

-- Een agenda-link weghalen: de boekingen die erdoor kwamen worden geannuleerd (en hun taken)
create function public.ical_feeds_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.stays set status = 'cancelled' where feed_id = old.id and status = 'confirmed' and check_out >= current_date;
  return old;
end $$;
create trigger ical_feeds_cleanup before delete on public.ical_feeds for each row execute function public.ical_feeds_cleanup();

-- Geen taken voor geblokkeerde dagen (alleen gebruikt door import). Verder ongewijzigd t.o.v. 7e.
create or replace function public.stays_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  if new.is_block then
    return null;
  end if;
  select title into v_title from public.properties where id = new.property_id;
  if new.status = 'confirmed' then
    insert into public.tasks (org_id, title, due_date, property_id, auto_key, notes)
    values (new.org_id, left('Accueil ' || new.guest_name || ' · ' || v_title, 200), new.check_in, new.property_id, 'stay:' || new.id || ':in',
            nullif(concat_ws(' · ', new.guest_phone, case when new.guests is not null then new.guests || ' pers.' end), ''))
    on conflict (org_id, auto_key) where auto_key is not null
      do update set due_date = excluded.due_date, title = excluded.title, notes = excluded.notes,
                    status = case when public.tasks.status = 'cancelled' then 'open'::public.task_status else public.tasks.status end;
    insert into public.tasks (org_id, title, due_date, property_id, auto_key)
    values (new.org_id, left('Ménage après ' || new.guest_name || ' · ' || v_title, 200), new.check_out, new.property_id, 'stay:' || new.id || ':out')
    on conflict (org_id, auto_key) where auto_key is not null
      do update set due_date = excluded.due_date, title = excluded.title,
                    status = case when public.tasks.status = 'cancelled' then 'open'::public.task_status else public.tasks.status end;
  else
    update public.tasks set status = 'cancelled'
    where org_id = new.org_id and auto_key in ('stay:' || new.id || ':in', 'stay:' || new.id || ':out') and status = 'open';
  end if;
  return null;
end $$;

-- De desk heeft de agenda-tekst opgehaald en in gebeurtenissen gesplitst: [{uid, start, end, block, note}].
-- Nieuwe gebeurtenissen worden boekingen, gewijzigde data schuiven mee, verdwenen toekomstige boekingen worden geannuleerd.
-- Overlapt een nieuwe boeking met een bestaande (ander kanaal of eigen boeking), dan wordt hij niet toegevoegd maar
-- gemeld als dubbele boeking. Een geblokkeerde dag die overlapt wordt stil overgeslagen (Airbnb geeft eigen
-- blokkades en doorgegeven boekingen ook als "niet beschikbaar" terug).
create function public.sync_ical_feed(p_feed uuid, p_events jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f        public.ical_feeds;
  ev       jsonb;
  v_uid    text;
  v_s      date;
  v_e      date;
  v_block  boolean;
  v_label  text;
  v_name   text;
  v_note   text;
  ex       public.stays;
  v_uids   text[] := '{}';
  n_new    integer := 0;
  n_upd    integer := 0;
  n_cancel integer := 0;
  v_conf   jsonb := '[]'::jsonb;
begin
  select * into f from public.ical_feeds where id = p_feed;
  if f.id is null or not public.can_write(f.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 1500 then
    raise exception 'ical_invalid' using errcode = '22023';
  end if;
  v_label := case f.channel when 'airbnb' then 'Airbnb' when 'booking' then 'Booking' when 'direct' then 'Direct' else 'Autre' end;

  for ev in select value from jsonb_array_elements(p_events) loop
    v_uid := left(ev->>'uid', 200);
    begin
      v_s := (ev->>'start')::date;
      v_e := (ev->>'end')::date;
    exception when others then
      continue;
    end;
    if v_uid is null or v_uid = '' or v_s is null or v_e is null or v_e <= v_s or v_e - v_s > 365 or v_e < current_date - 60 then
      continue;
    end if;
    v_uids := v_uids || v_uid;
    v_block := coalesce(ev->>'block', 'false') = 'true';
    v_name := case when v_block then v_label || ' · bloqué' else v_label end;
    v_note := nullif(left(coalesce(ev->>'note', ''), 500), '');

    select * into ex from public.stays where feed_id = f.id and external_uid = v_uid;
    if ex.id is not null then
      if ex.check_in <> v_s or ex.check_out <> v_e or ex.status <> 'confirmed' then
        begin
          update public.stays set check_in = v_s, check_out = v_e, status = 'confirmed' where id = ex.id;
          n_upd := n_upd + 1;
        exception when sqlstate '23514' then
          if not v_block then
            v_conf := v_conf || jsonb_build_array(jsonb_build_object('start', v_s, 'end', v_e, 'name', v_name));
          end if;
        end;
      end if;
    else
      begin
        insert into public.stays (org_id, property_id, guest_name, channel, check_in, check_out, notes, is_block, feed_id, external_uid, status)
        values (f.org_id, f.property_id, v_name, f.channel, v_s, v_e, v_note, v_block, f.id, v_uid, 'confirmed');
        n_new := n_new + 1;
      exception when sqlstate '23514' then
        if not v_block then
          v_conf := v_conf || jsonb_build_array(jsonb_build_object('start', v_s, 'end', v_e, 'name', v_name));
        end if;
      end;
    end if;
  end loop;

  -- Verdwenen uit het kanaal (alleen toekomstige boekingen): annuleren
  with c as (
    update public.stays set status = 'cancelled'
    where feed_id = f.id and status = 'confirmed' and check_out >= current_date and not (external_uid = any (v_uids))
    returning 1)
  select count(*) into n_cancel from c;

  update public.ical_feeds
     set last_synced_at = now(), last_status = 'ok', last_count = n_new + n_upd, last_conflicts = v_conf
   where id = f.id;
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'cancelled', n_cancel, 'conflicts', v_conf);
end $$;

alter table public.ical_feeds enable row level security;
create policy ical_feeds_select on public.ical_feeds for select to authenticated using (public.can_write(org_id) or public.can_manage(org_id));
create policy ical_feeds_insert on public.ical_feeds for insert to authenticated with check (public.can_write(org_id));
create policy ical_feeds_update on public.ical_feeds for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy ical_feeds_delete on public.ical_feeds for delete to authenticated using (public.can_write(org_id));

revoke all on table public.ical_feeds from anon, authenticated;
grant select on public.ical_feeds to authenticated;
grant insert (org_id, property_id, channel, url) on public.ical_feeds to authenticated;
grant update (channel, url, last_status) on public.ical_feeds to authenticated;
grant delete on public.ical_feeds to authenticated;

revoke all on function public.ical_feeds_guard(), public.ical_feeds_cleanup(), public.stays_tasks() from public, anon, authenticated;
revoke all on function public.sync_ical_feed(uuid, jsonb) from public, anon;
grant execute on function public.sync_ical_feed(uuid, jsonb) to authenticated;

-- Taal van de gast mag in een boeking worden ingevuld
grant insert (guest_lang) on public.stays to authenticated;
grant update (guest_lang) on public.stays to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Gastenpagina per woning
-- ---------------------------------------------------------------------------------------------------------------
create table public.stay_guides (
  property_id   uuid primary key,
  org_id        uuid not null references public.organizations(id),
  token         text unique check (token is null or token ~ '^[0-9a-f]{64}$'),
  intro         text check (intro is null or char_length(intro) <= 1500),
  arrival       text check (arrival is null or char_length(arrival) <= 2000),
  checkin_time  text check (checkin_time is null or char_length(checkin_time) <= 20),
  checkout_time text check (checkout_time is null or char_length(checkout_time) <= 20),
  wifi_name     text check (wifi_name is null or char_length(wifi_name) <= 80),
  wifi_password text check (wifi_password is null or char_length(wifi_password) <= 80),
  rules         text check (rules is null or char_length(rules) <= 2000),
  tips          text check (tips is null or char_length(tips) <= 2000),
  updated_at    timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create trigger stay_guides_touch before update on public.stay_guides for each row execute function public.touch_updated_at();
create trigger stay_guides_org_lock before update on public.stay_guides for each row execute function public.forbid_org_change();

-- De link van de gastenpagina maken, vernieuwen (de oude werkt dan niet meer) of uitzetten
create function public.set_guide_link(p_property uuid, p_on boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  v text := case when p_on then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') else null end;
begin
  select org_id into o from public.properties where id = p_property and purpose = 'rent_short';
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  insert into public.stay_guides (property_id, org_id, token) values (p_property, o, v)
  on conflict (property_id) do update set token = excluded.token;
  return v;
end $$;

create function public.public_stay_guide(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  g public.stay_guides;
  p public.properties;
  o public.organizations;
  v_photos jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into g from public.stay_guides where token = p_token;
  if g.property_id is null then
    return null;
  end if;
  select * into p from public.properties where id = g.property_id;
  select * into o from public.organizations where id = g.org_id and is_active;
  if p.id is null or o.id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text order by ph.is_cover desc, ph.created_at, ph.id), '[]'::jsonb)
    into v_photos from public.property_photos ph where ph.property_id = p.id;
  return jsonb_build_object(
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'property', jsonb_build_object('title', p.title, 'reference', p.reference, 'city', p.city, 'neighborhood', p.neighborhood, 'address_note', p.address_note,
                                   'bedrooms', p.bedrooms, 'photos', v_photos, 'online', p.is_published),
    'guide', jsonb_build_object('intro', g.intro, 'arrival', g.arrival, 'checkin_time', g.checkin_time, 'checkout_time', g.checkout_time,
                                'wifi_name', g.wifi_name, 'wifi_password', g.wifi_password, 'rules', g.rules, 'tips', g.tips));
end $$;

alter table public.stay_guides enable row level security;
create policy stay_guides_select on public.stay_guides for select to authenticated using (public.can_write(org_id) or public.can_manage(org_id));
create policy stay_guides_insert on public.stay_guides for insert to authenticated with check (public.can_write(org_id));
create policy stay_guides_update on public.stay_guides for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.stay_guides from anon, authenticated;
grant select on public.stay_guides to authenticated;
grant insert (property_id, org_id, intro, arrival, checkin_time, checkout_time, wifi_name, wifi_password, rules, tips) on public.stay_guides to authenticated;
grant update (intro, arrival, checkin_time, checkout_time, wifi_name, wifi_password, rules, tips) on public.stay_guides to authenticated;

revoke all on function public.set_guide_link(uuid, boolean), public.public_stay_guide(text) from public, anon;
grant execute on function public.set_guide_link(uuid, boolean) to authenticated;
grant execute on function public.public_stay_guide(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Schoonmaaklink zonder account
-- ---------------------------------------------------------------------------------------------------------------
create table public.cleaners (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null check (char_length(trim(name)) between 1 and 100),
  phone      text check (phone is null or char_length(phone) <= 40),
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{64}$'),
  active     boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create trigger cleaners_by before insert on public.cleaners for each row execute function public.set_created_by();
create trigger cleaners_org_lock before update on public.cleaners for each row execute function public.forbid_org_change();

create table public.cleaner_properties (
  cleaner_id  uuid not null,
  property_id uuid not null,
  org_id      uuid not null references public.organizations(id),
  primary key (cleaner_id, property_id),
  foreign key (cleaner_id, org_id)  references public.cleaners (id, org_id) on delete cascade,
  foreign key (property_id, org_id) references public.properties (id, org_id)
);

create table public.cleaning_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  task_id     uuid not null,
  property_id uuid not null,
  cleaner_id  uuid,
  note        text check (note is null or char_length(note) <= 500),
  photo       text check (photo is null or char_length(photo) <= 300000),
  done_at     timestamptz not null default now(),
  unique (task_id),
  foreign key (task_id, org_id)     references public.tasks (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id)
);
create index cleaning_reports_org_idx on public.cleaning_reports (org_id, done_at desc);

-- Wat de schoonmaakpersoon ziet: de ménage-taken van zijn woningen (laatste 3 dagen tot 30 dagen vooruit), met de
-- volgende aankomst. Geen namen of nummers van gasten, geen bedragen.
create function public.public_cleaner_page(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.cleaners;
  o public.organizations;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into c from public.cleaners where token = p_token and active;
  if c.id is null then
    return null;
  end if;
  select * into o from public.organizations where id = c.org_id and is_active;
  if o.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'cleaner', c.name,
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', t.id, 'due_date', t.due_date, 'title', p.title, 'city', p.city, 'neighborhood', p.neighborhood, 'address_note', p.address_note,
                 'next_arrival', (select min(s.check_in) from public.stays s where s.property_id = p.id and s.status = 'confirmed' and not s.is_block and s.check_in >= t.due_date))
               order by t.due_date, p.title), '[]'::jsonb)
              from public.tasks t
              join public.cleaner_properties cp on cp.property_id = t.property_id and cp.cleaner_id = c.id
              join public.properties p on p.id = t.property_id
              where t.org_id = c.org_id and t.status = 'open' and t.auto_key like 'stay:%:out'
                and t.due_date between current_date - 3 and current_date + 30),
    'done', (select coalesce(jsonb_agg(jsonb_build_object('title', p.title, 'done_at', r.done_at) order by r.done_at desc), '[]'::jsonb)
             from (select * from public.cleaning_reports where cleaner_id = c.id order by done_at desc limit 8) r
             join public.properties p on p.id = r.property_id));
end $$;

-- "Klaar": de taak op done, met een korte opmerking en een kleine foto als bewijs
create function public.cleaner_mark_done(p_token text, p_task uuid, p_note text, p_photo text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c public.cleaners;
  t public.tasks;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  select * into c from public.cleaners where token = p_token and active;
  if c.id is null or not public.org_is_open(c.org_id) then
    return false;
  end if;
  select * into t from public.tasks
  where id = p_task and org_id = c.org_id and status = 'open' and auto_key like 'stay:%:out'
    and property_id in (select property_id from public.cleaner_properties where cleaner_id = c.id);
  if t.id is null then
    return false;
  end if;
  if p_photo is not null and (char_length(p_photo) > 300000 or p_photo !~ '^[A-Za-z0-9+/=]+$') then
    raise exception 'cleaning_photo_invalid' using errcode = '22023';
  end if;
  insert into public.cleaning_reports (org_id, task_id, property_id, cleaner_id, note, photo)
  values (c.org_id, t.id, t.property_id, c.id, nullif(left(trim(coalesce(p_note, '')), 500), ''), nullif(p_photo, ''))
  on conflict (task_id) do nothing;
  update public.tasks set status = 'done' where id = t.id;
  return true;
end $$;

alter table public.cleaners enable row level security;
alter table public.cleaner_properties enable row level security;
alter table public.cleaning_reports enable row level security;
create policy cleaners_select on public.cleaners for select to authenticated using (public.can_write(org_id) or public.can_manage(org_id));
create policy cleaners_insert on public.cleaners for insert to authenticated with check (public.can_write(org_id));
create policy cleaners_update on public.cleaners for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy cleaner_props_select on public.cleaner_properties for select to authenticated using (public.can_write(org_id) or public.can_manage(org_id));
create policy cleaner_props_insert on public.cleaner_properties for insert to authenticated with check (public.can_write(org_id));
create policy cleaner_props_delete on public.cleaner_properties for delete to authenticated using (public.can_write(org_id));
create policy cleaning_reports_select on public.cleaning_reports for select to authenticated using (public.is_member(org_id));

revoke all on table public.cleaners, public.cleaner_properties, public.cleaning_reports from anon, authenticated;
grant select on public.cleaners, public.cleaner_properties, public.cleaning_reports to authenticated;
grant insert (org_id, name, phone) on public.cleaners to authenticated;
grant update (name, phone, active) on public.cleaners to authenticated;
grant insert (cleaner_id, property_id, org_id) on public.cleaner_properties to authenticated;
grant delete on public.cleaner_properties to authenticated;

revoke all on function public.public_cleaner_page(text), public.cleaner_mark_done(text, uuid, text, text) from public, anon;
grant execute on function public.public_cleaner_page(text), public.cleaner_mark_done(text, uuid, text, text) to anon, authenticated;
