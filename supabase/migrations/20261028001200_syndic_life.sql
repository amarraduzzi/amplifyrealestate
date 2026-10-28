-- Amplify Vastgoed, etappe 9c/9d/9e: syndic, het leven in de residentie
--
-- 9c residence_incidents: storingen en onderhoud in de gemeenschappelijke delen (lift, trap, zwembad, ...), met urgentie,
--    reparateur, kosten en status.
--    residence_announcements: mededelingen aan de bewoners (waterafsluiting, schoonmaak, ...).
-- 9d De assemblée générale (AG): datum en plaats, agenda als resoluties, aanwezigheid per kavel (aanwezig, vertegenwoordigd,
--    afwezig) en de stem per kavel per resolutie (pour, contre, abstention). De uitslag telt in tantièmes. Per resolutie
--    kies je de meerderheid: "simple" (meer voor dan tegen bij de uitgebrachte stemmen), "absolute" (meer dan de helft van
--    alle tantièmes van de residentie) of "three_quarters" (driekwart van alle tantièmes). Welke meerderheid de wet
--    (loi 18-00) of het reglement voor een besluit vraagt, kiest de syndic.
--    Na afsluiten (held) liggen aanwezigheid en stemmen vast.
-- 9e Bewonersportaal: per kavel een persoonlijke link (zonder account) waar de copropriétaire zijn saldo, de appels de
--    fonds, de mededelingen, de storingen en de AG's met uitslag ziet. Zelfde veiligheid als het eigenaarsportaal (7a).
--
-- Rechten: aanmaken en wijzigen eigenaar, manager en agent (can_write); lezen alle leden. Bezoekers alleen via
-- public_resident_portal().

create type public.incident_status as enum ('open', 'in_progress', 'done', 'cancelled');
create type public.assembly_status as enum ('planned', 'held', 'cancelled');
create type public.majority_rule as enum ('simple', 'absolute', 'three_quarters');
create type public.presence as enum ('present', 'represented', 'absent');
create type public.vote_choice as enum ('for', 'against', 'abstain');

create table public.residence_incidents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  residence_id       uuid not null,
  title              text not null check (char_length(trim(title)) between 2 and 200),
  location           text check (location is null or char_length(location) <= 100),
  description        text check (description is null or char_length(description) <= 2000),
  urgent             boolean not null default false,
  status             public.incident_status not null default 'open',
  assigned_person_id uuid,
  cost_cents         bigint check (cost_cents is null or cost_cents >= 0),
  reported_on        date not null default current_date,
  done_on            date,
  show_residents     boolean not null default true,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (residence_id, org_id) references public.residences (id, org_id),
  foreign key (assigned_person_id, org_id) references public.people (id, org_id),
  check ((status = 'done') = (done_on is not null))
);
create index residence_incidents_idx on public.residence_incidents (residence_id, reported_on desc);

create table public.residence_announcements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  residence_id uuid not null,
  title        text not null check (char_length(trim(title)) between 2 and 200),
  body         text check (body is null or char_length(body) <= 3000),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (residence_id, org_id) references public.residences (id, org_id)
);
create index residence_announcements_idx on public.residence_announcements (residence_id, created_at desc);

create table public.assemblies (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  residence_id uuid not null,
  title        text not null default 'Assemblée générale ordinaire' check (char_length(trim(title)) between 2 and 200),
  held_at      timestamptz not null,
  place        text check (place is null or char_length(place) <= 300),
  status       public.assembly_status not null default 'planned',
  notes        text check (notes is null or char_length(notes) <= 3000),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (residence_id, org_id) references public.residences (id, org_id)
);
create index assemblies_idx on public.assemblies (residence_id, held_at desc);

create table public.assembly_resolutions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  assembly_id uuid not null,
  position    smallint not null check (position between 1 and 50),
  text        text not null check (char_length(trim(text)) between 2 and 1000),
  majority    public.majority_rule not null default 'simple',
  unique (id, org_id),
  unique (assembly_id, position),
  foreign key (assembly_id, org_id) references public.assemblies (id, org_id)
);

create table public.assembly_presence (
  org_id      uuid not null,
  assembly_id uuid not null,
  lot_id      uuid not null,
  presence    public.presence not null,
  proxy_name  text check (proxy_name is null or char_length(proxy_name) <= 200),
  primary key (assembly_id, lot_id),
  foreign key (assembly_id, org_id) references public.assemblies (id, org_id),
  foreign key (lot_id, org_id) references public.residence_lots (id, org_id)
);

create table public.assembly_votes (
  org_id        uuid not null,
  resolution_id uuid not null,
  lot_id        uuid not null,
  vote          public.vote_choice not null,
  primary key (resolution_id, lot_id),
  foreign key (resolution_id, org_id) references public.assembly_resolutions (id, org_id),
  foreign key (lot_id, org_id) references public.residence_lots (id, org_id)
);

create table public.resident_links (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  lot_id         uuid not null,
  token          text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  lang           text not null default 'fr' check (lang in ('fr', 'ar', 'en', 'nl')),
  expires_at     timestamptz not null default now() + interval '1 year',
  revoked_at     timestamptz,
  last_opened_at timestamptz,
  open_count     integer not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (lot_id, org_id) references public.residence_lots (id, org_id)
);
create unique index resident_links_one_active_idx on public.resident_links (lot_id) where revoked_at is null;

create trigger incidents_touch   before update on public.residence_incidents for each row execute function public.touch_updated_at();
create trigger incidents_by      before insert on public.residence_incidents for each row execute function public.set_created_by();
create trigger announcements_by  before insert on public.residence_announcements for each row execute function public.set_created_by();
create trigger assemblies_touch  before update on public.assemblies for each row execute function public.touch_updated_at();
create trigger assemblies_by     before insert on public.assemblies for each row execute function public.set_created_by();

-- done_on volgt de status van een storing
create function public.incidents_done()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then new.done_on := coalesce(new.done_on, current_date); else new.done_on := null; end if;
  return new;
end $$;
create trigger incidents_done before insert or update on public.residence_incidents for each row execute function public.incidents_done();

-- Na een gehouden AG liggen agenda, aanwezigheid en stemmen vast
create function public.assembly_locked(p_assembly uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assemblies where id = p_assembly and status <> 'planned')
$$;
create function public.assembly_children_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_assembly uuid;
begin
  if tg_table_name = 'assembly_votes' then
    select assembly_id into v_assembly from public.assembly_resolutions where id = coalesce(new.resolution_id, old.resolution_id);
  else
    v_assembly := coalesce(new.assembly_id, old.assembly_id);
  end if;
  if public.assembly_locked(v_assembly) then
    raise exception 'assembly_closed' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger resolutions_lock before insert or update or delete on public.assembly_resolutions for each row execute function public.assembly_children_lock();
create trigger presence_lock    before insert or update or delete on public.assembly_presence    for each row execute function public.assembly_children_lock();
create trigger votes_lock       before insert or update or delete on public.assembly_votes       for each row execute function public.assembly_children_lock();

create function public.assemblies_lock()
returns trigger language plpgsql as $$
begin
  if old.status = 'held' then
    raise exception 'assembly_closed' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger assemblies_lock before update on public.assemblies for each row execute function public.assemblies_lock();

-- Bewonerslink per kavel (de vorige wordt ingetrokken)
create function public.create_resident_link(p_lot uuid, p_lang text default 'fr')
returns text
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  v text;
begin
  select org_id into o from public.residence_lots where id = p_lot;
  if o is not null and public.is_member(o) and not public.org_is_open(o) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  update public.resident_links set revoked_at = now() where lot_id = p_lot and revoked_at is null;
  insert into public.resident_links (org_id, lot_id, lang, created_by)
  values (o, p_lot, case when p_lang in ('fr', 'ar', 'en', 'nl') then p_lang else 'fr' end, auth.uid())
  returning token into v;
  return v;
end $$;

create function public.revoke_resident_link(p_lot uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
begin
  select org_id into o from public.residence_lots where id = p_lot;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  update public.resident_links set revoked_at = now() where lot_id = p_lot and revoked_at is null;
end $$;

-- Het bewonersportaal. null = ongeldige, verlopen of ingetrokken link.
create function public.public_resident_portal(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k  public.resident_links;
  l  public.residence_lots;
  r  public.residences;
  o  public.organizations;
  v_total numeric;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.resident_links where token = p_token and revoked_at is null and expires_at > now();
  if k.id is null then return null; end if;
  update public.resident_links set last_opened_at = now(), open_count = open_count + 1 where id = k.id;
  select * into l from public.residence_lots where id = k.lot_id;
  select * into r from public.residences where id = l.residence_id;
  select * into o from public.organizations where id = r.org_id;
  select coalesce(sum(tantiemes), 0) into v_total from public.residence_lots where residence_id = r.id;

  return jsonb_build_object(
    'lang', k.lang,
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'residence', jsonb_build_object('name', r.name, 'address', r.address, 'city', r.city, 'rib', r.rib),
    'lot', jsonb_build_object('label', l.label, 'kind', l.kind, 'floor', l.floor, 'tantiemes', l.tantiemes, 'total_tantiemes', v_total,
                              'owner', (select full_name from public.people where id = l.owner_person_id)),
    'charges', (select coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'due_date', c.due_date, 'amount_cents', i.amount_cents,
                                                              'paid_cents', i.paid_cents, 'paid_on', i.paid_on) order by c.due_date desc), '[]'::jsonb)
                from public.charge_items i join public.charge_calls c on c.id = i.call_id
                where i.lot_id = l.id and c.status = 'issued'),
    'announcements', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body, 'date', a.created_at) order by a.created_at desc), '[]'::jsonb)
                      from (select * from public.residence_announcements where residence_id = r.id order by created_at desc limit 20) a),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'location', x.location, 'status', x.status, 'reported_on', x.reported_on, 'done_on', x.done_on) order by x.reported_on desc), '[]'::jsonb)
                  from (select * from public.residence_incidents where residence_id = r.id and show_residents and status <> 'cancelled'
                          and (status <> 'done' or done_on > current_date - 60) order by reported_on desc limit 20) x),
    'assemblies', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'held_at', a.held_at, 'place', a.place, 'status', a.status,
        'resolutions', (select coalesce(jsonb_agg(jsonb_build_object('position', z.position, 'text', z.text, 'majority', z.majority,
            'for', (select coalesce(sum(rl.tantiemes), 0) from public.assembly_votes v join public.residence_lots rl on rl.id = v.lot_id where v.resolution_id = z.id and v.vote = 'for'),
            'against', (select coalesce(sum(rl.tantiemes), 0) from public.assembly_votes v join public.residence_lots rl on rl.id = v.lot_id where v.resolution_id = z.id and v.vote = 'against'),
            'abstain', (select coalesce(sum(rl.tantiemes), 0) from public.assembly_votes v join public.residence_lots rl on rl.id = v.lot_id where v.resolution_id = z.id and v.vote = 'abstain'))
            order by z.position), '[]'::jsonb) from public.assembly_resolutions z where z.assembly_id = a.id)
      ) order by a.held_at desc), '[]'::jsonb)
      from (select * from public.assemblies where residence_id = r.id and status <> 'cancelled' order by held_at desc limit 5) a),
    'generated_at', now()
  );
end $$;

do $rls$
declare t text;
begin
  foreach t in array array['residence_incidents', 'residence_announcements', 'assemblies', 'assembly_resolutions', 'assembly_presence', 'assembly_votes', 'resident_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $rls$;

create policy incidents_select on public.residence_incidents for select to authenticated using (public.is_member(org_id));
create policy incidents_insert on public.residence_incidents for insert to authenticated with check (public.can_write(org_id));
create policy incidents_update on public.residence_incidents for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy announcements_select on public.residence_announcements for select to authenticated using (public.is_member(org_id));
create policy announcements_insert on public.residence_announcements for insert to authenticated with check (public.can_write(org_id));
create policy announcements_delete on public.residence_announcements for delete to authenticated using (public.can_write(org_id));
create policy assemblies_select on public.assemblies for select to authenticated using (public.is_member(org_id));
create policy assemblies_insert on public.assemblies for insert to authenticated with check (public.can_write(org_id));
create policy assemblies_update on public.assemblies for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy resolutions_select on public.assembly_resolutions for select to authenticated using (public.is_member(org_id));
create policy resolutions_write on public.assembly_resolutions for all to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy presence_select on public.assembly_presence for select to authenticated using (public.is_member(org_id));
create policy presence_write on public.assembly_presence for all to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy votes_select on public.assembly_votes for select to authenticated using (public.is_member(org_id));
create policy votes_write on public.assembly_votes for all to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy resident_links_select on public.resident_links for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');

grant insert (org_id, residence_id, title, location, description, urgent, status, assigned_person_id, cost_cents, reported_on, show_residents) on public.residence_incidents to authenticated;
grant update (title, location, description, urgent, status, assigned_person_id, cost_cents, done_on, show_residents) on public.residence_incidents to authenticated;
grant insert (org_id, residence_id, title, body) on public.residence_announcements to authenticated;
grant delete on public.residence_announcements to authenticated;
grant insert (org_id, residence_id, title, held_at, place, notes) on public.assemblies to authenticated;
grant update (title, held_at, place, notes, status) on public.assemblies to authenticated;
grant insert, update, delete on public.assembly_resolutions, public.assembly_presence, public.assembly_votes to authenticated;

revoke all on function public.incidents_done(), public.assembly_children_lock(), public.assemblies_lock(), public.assembly_locked(uuid) from public, anon, authenticated;
revoke all on function public.create_resident_link(uuid, text), public.revoke_resident_link(uuid), public.public_resident_portal(text) from public;
grant execute on function public.create_resident_link(uuid, text), public.revoke_resident_link(uuid) to authenticated;
grant execute on function public.public_resident_portal(text) to anon, authenticated;
