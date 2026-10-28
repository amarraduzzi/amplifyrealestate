-- Amplify Vastgoed, etappe 10c: verkoopteam, leads per project en een publieke projectpagina
--
--  * dev_project_team: welke medewerkers een project verkopen. Een aanvraag via de projectpagina gaat als taak naar
--    het teamlid met de minste open taken (zonder team: naar niemand, iedereen ziet de taak).
--  * leads.project_id: een lead kan bij een project horen (aanvraag via de pagina of met de hand toegevoegd).
--  * dev_project_photos: foto's van het project (zelfde openbare bucket als de panden: {org}/{project}/{foto}).
--  * dev_projects.slug / published / show_prices: de projectpagina /{kantoor}/projet/{slug}. Prijzen tonen of niet.
--  * public_project_page en public_office_projects (voor bezoekers), submit_project_inquiry (het formulier).
--
-- Regels: alleen gepubliceerde projecten van een actief kantoor zijn zichtbaar; bezoekers zien alleen de vrije lots en
-- nooit kopers of verkopen. Het formulier heeft dezelfde bescherming als dat van de panden (6e): honingpot, maximaal
-- 30 aanvragen per uur per kantoor, dezelfde persoon niet twee keer binnen 10 minuten.

alter table public.dev_projects
  add column slug        text check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  add column published   boolean not null default false,
  add column show_prices boolean not null default true;
create unique index dev_projects_slug_idx on public.dev_projects (org_id, slug) where slug is not null;
grant insert (slug, published, show_prices) on public.dev_projects to authenticated;
grant update (slug, published, show_prices) on public.dev_projects to authenticated;

-- Publiceren kan alleen met een slug
alter table public.dev_projects add constraint dev_projects_published_slug check (not published or slug is not null);

create table public.dev_project_team (
  project_id uuid not null,
  org_id     uuid not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, org_id) references public.dev_projects (id, org_id) on delete cascade
);
create function public.dev_team_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'team_not_member' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger dev_team_check before insert on public.dev_project_team for each row execute function public.dev_team_check();

alter table public.leads add column project_id uuid;
alter table public.leads add constraint leads_project_fk foreign key (project_id, org_id) references public.dev_projects (id, org_id);
create index leads_project_idx on public.leads (project_id) where project_id is not null;

create table public.dev_project_photos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  project_id  uuid not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (project_id, org_id) references public.dev_projects (id, org_id) on delete cascade
);
create index dev_project_photos_idx on public.dev_project_photos (project_id, position, created_at);
create function public.dev_photos_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.dev_project_photos where project_id = new.project_id) >= 20 then
    raise exception 'photo_limit' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger dev_photos_limit before insert on public.dev_project_photos for each row execute function public.dev_photos_limit();

alter table public.dev_project_team enable row level security;
alter table public.dev_project_photos enable row level security;
create policy dev_team_select on public.dev_project_team for select to authenticated using (public.is_member(org_id));
create policy dev_team_insert on public.dev_project_team for insert to authenticated with check (public.can_write(org_id));
create policy dev_team_delete on public.dev_project_team for delete to authenticated using (public.can_write(org_id));
create policy dev_photos_select on public.dev_project_photos for select to authenticated using (public.is_member(org_id));
create policy dev_photos_insert on public.dev_project_photos for insert to authenticated with check (public.can_write(org_id));
create policy dev_photos_update on public.dev_project_photos for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));
create policy dev_photos_delete on public.dev_project_photos for delete to authenticated using (public.can_write(org_id));
revoke all on table public.dev_project_team, public.dev_project_photos from anon, authenticated;
grant select, insert, delete on public.dev_project_team to authenticated;
grant select, delete on public.dev_project_photos to authenticated;
grant insert (id, org_id, project_id, position) on public.dev_project_photos to authenticated;
grant update (position) on public.dev_project_photos to authenticated;

-- ---------------------------------------------------------------- voor bezoekers
create function public.public_project_page(p_slug text, p_project text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.organizations;
  p public.dev_projects;
begin
  select * into o from public.organizations where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if o.id is null then return null; end if;
  select * into p from public.dev_projects where org_id = o.id and slug = lower(trim(coalesce(p_project, ''))) and published and not archived;
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone,
                                 'email', o.public_email, 'domain', o.custom_domain),
    'project', jsonb_build_object('name', p.name, 'slug', p.slug, 'city', p.city, 'address', p.address, 'description', p.description,
      'status', p.status, 'delivery_date', p.delivery_date, 'show_prices', p.show_prices,
      'photos', (select coalesce(jsonb_agg(ph.org_id || '/' || ph.project_id || '/' || ph.id order by ph.position, ph.created_at), '[]'::jsonb)
                 from public.dev_project_photos ph where ph.project_id = p.id),
      'total_units', (select count(*) from public.dev_units where project_id = p.id),
      'available_units', (select count(*) from public.dev_units where project_id = p.id and status = 'available')),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('reference', u.reference, 'kind', u.kind, 'building', u.building, 'floor', u.floor,
                'bedrooms', u.bedrooms, 'area_m2', u.area_m2, 'terrace_m2', u.terrace_m2,
                'price_cents', case when p.show_prices then u.price_cents end)
                order by u.building nulls first, u.floor nulls first, u.reference), '[]'::jsonb)
              from public.dev_units u where u.project_id = p.id and u.status = 'available')
  );
end $$;

create function public.public_office_projects(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.name, 'slug', p.slug, 'city', p.city, 'status', p.status, 'delivery_date', p.delivery_date,
      'cover', (select ph.org_id || '/' || ph.project_id || '/' || ph.id from public.dev_project_photos ph where ph.project_id = p.id order by ph.position, ph.created_at limit 1),
      'available_units', (select count(*) from public.dev_units u where u.project_id = p.id and u.status = 'available'),
      'price_from', case when p.show_prices then (select min(u.price_cents) from public.dev_units u where u.project_id = p.id and u.status = 'available') end
    ) order by p.name), '[]'::jsonb)
  from public.dev_projects p join public.organizations o on o.id = p.org_id
  where o.slug = lower(trim(coalesce(p_slug, ''))) and o.is_active and p.published and not p.archived
$$;

create function public.submit_project_inquiry(p_slug text, p_project text, p_name text, p_phone text, p_message text,
  p_unit text default null, p_trap text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o        public.organizations;
  p        public.dev_projects;
  v_name   text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 120);
  v_phone  text := left(trim(coalesce(p_phone, '')), 40);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail   text;
  v_msg    text := nullif(left(trim(coalesce(p_message, '')), 1000), '');
  v_unit   text := nullif(left(trim(coalesce(p_unit, '')), 40), '');
  v_person uuid;
  v_lead   uuid;
  v_agent  uuid;
  v_note   text;
begin
  if coalesce(p_trap, '') <> '' then return true; end if;
  if char_length(v_name) < 2 or char_length(v_digits) not between 8 and 15 then
    raise exception 'inquiry_invalid' using errcode = '22023';
  end if;
  v_tail := right(v_digits, 9);
  select * into o from public.organizations where slug = lower(trim(coalesce(p_slug, ''))) and is_active;
  if o.id is null then raise exception 'inquiry_invalid' using errcode = '22023'; end if;
  select * into p from public.dev_projects where org_id = o.id and slug = lower(trim(coalesce(p_project, ''))) and published and not archived;
  if p.id is null then raise exception 'inquiry_invalid' using errcode = '22023'; end if;
  if v_unit is not null and not exists (select 1 from public.dev_units where project_id = p.id and reference = v_unit) then
    v_unit := null;
  end if;

  if (select count(*) from public.leads where org_id = o.id and source = 'public_page' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'inquiry_busy' using errcode = '54000';
  end if;

  select id into v_person from public.people
  where org_id = o.id
    and (right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_tail
      or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail)
  order by created_at limit 1;
  if v_person is not null and exists (
       select 1 from public.leads where person_id = v_person and source = 'public_page' and created_at > now() - interval '10 minutes') then
    return true;
  end if;
  if v_person is null then
    insert into public.people (org_id, full_name, phone, whatsapp, notes)
    values (o.id, v_name, v_phone, v_phone, 'Via la page du projet ' || p.name)
    returning id into v_person;
  end if;

  v_note := 'Demande via la page du projet ' || p.name || coalesce(' pour le lot ' || v_unit, '')
    || ' le ' || to_char(now() at time zone 'Africa/Casablanca', 'DD/MM/YYYY HH24:MI') || coalesce(E' :\n' || v_msg, '');
  select id into v_lead from public.leads
  where person_id = v_person and project_id = p.id and status in ('new', 'active', 'viewing') order by created_at desc limit 1;
  if v_lead is not null then
    update public.leads set notes = left(coalesce(notes || E'\n\n', '') || v_note, 4000) where id = v_lead;
  else
    insert into public.leads (org_id, person_id, purpose, status, source, city, project_id, notes)
    values (o.id, v_person, 'sale', 'new', 'public_page', coalesce(p.city, o.city), p.id, v_note)
    returning id into v_lead;
  end if;

  -- Het teamlid met de minste open taken krijgt de terugbeltaak
  select t.user_id into v_agent from public.dev_project_team t
  where t.project_id = p.id and exists (select 1 from public.memberships m where m.org_id = o.id and m.user_id = t.user_id)
  order by (select count(*) from public.tasks k where k.org_id = o.id and k.assigned_to = t.user_id and k.status = 'open'), t.created_at
  limit 1;
  insert into public.tasks (org_id, title, notes, due_date, lead_id, assigned_to)
  values (o.id, left('Rappeler ' || v_name || ' (projet ' || p.name || ')', 200), coalesce(v_unit || ': ', '') || coalesce(v_msg, ''), current_date, v_lead, v_agent);
  perform public.bump_page_stat(o.id, null, 'form');
  return true;
end $$;

revoke all on function public.dev_team_check(), public.dev_photos_limit() from public, anon, authenticated;
revoke all on function public.public_project_page(text, text), public.public_office_projects(text),
  public.submit_project_inquiry(text, text, text, text, text, text, text) from public;
grant execute on function public.public_project_page(text, text), public.public_office_projects(text),
  public.submit_project_inquiry(text, text, text, text, text, text, text) to anon, authenticated;
