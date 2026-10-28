-- Amplify Vastgoed, etappe 7a: het eigenaarsportaal
--
-- Een eigenaar (ook een MRE in Nederland, België of Frankrijk) krijgt een persoonlijke link en ziet daar zonder account
-- al zijn panden bij dit kantoor: status en prijs, de activiteit (bezichtigingen, geïnteresseerden, offertes, bezoeken van
-- de online pagina, waar het pand geadverteerd is), en bij verhuur de huurder, de huur per maand van de laatste 12
-- maanden (betaald, te betalen, te laat) en de reparaties met de kosten.
--
-- Regels:
--  * De link bevat een lange willekeurige code (64 tekens). Wie de link heeft, ziet het portaal: stuur hem alleen naar de
--    eigenaar zelf. Per eigenaar is er hooguit een geldige link; een nieuwe link maken maakt de oude ongeldig.
--  * Een link vervalt na een jaar, en het kantoor kan hem op elk moment intrekken.
--  * Het portaal toont nooit namen of nummers van geïnteresseerden, de commissie, interne notities of documenten.
--  * Links maken en intrekken: eigenaar, manager en agent (can_write). Bezoekers hebben alleen public_owner_portal().

create table public.owner_links (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  person_id      uuid not null,
  token          text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  lang           text not null default 'fr' check (lang in ('fr', 'ar', 'en', 'nl')),
  expires_at     timestamptz not null default now() + interval '1 year',
  revoked_at     timestamptz,
  last_opened_at timestamptz,
  open_count     integer not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id)
);
create unique index owner_links_one_active_idx on public.owner_links (person_id) where revoked_at is null;
create index owner_links_org_idx on public.owner_links (org_id);

-- Een nieuwe link voor een eigenaar (de vorige wordt ingetrokken). Geeft de code terug.
create function public.create_owner_link(p_person uuid, p_lang text default 'fr')
returns text
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
  v_token text;
begin
  select org_id into o from public.people where id = p_person;
  if o is not null and public.is_member(o) and not public.org_is_open(o) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.property_parties where person_id = p_person and role = 'owner') then
    raise exception 'owner_has_no_property' using errcode = '23514';
  end if;
  update public.owner_links set revoked_at = now() where person_id = p_person and revoked_at is null;
  insert into public.owner_links (org_id, person_id, lang, created_by)
  values (o, p_person, case when p_lang in ('fr', 'ar', 'en', 'nl') then p_lang else 'fr' end, auth.uid())
  returning token into v_token;
  return v_token;
end $$;

create function public.revoke_owner_link(p_person uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o uuid;
begin
  select org_id into o from public.people where id = p_person;
  if o is null or not public.can_write(o) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  update public.owner_links set revoked_at = now() where person_id = p_person and revoked_at is null;
end $$;

-- Het portaal zelf, voor de bezoeker met de link. null = ongeldige, verlopen of ingetrokken link.
create function public.public_owner_portal(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k   public.owner_links;
  o   public.organizations;
  v_props jsonb;
  v_name text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into k from public.owner_links
  where token = p_token and revoked_at is null and expires_at > now();
  if k.id is null then
    return null;
  end if;
  update public.owner_links set last_opened_at = now(), open_count = open_count + 1 where id = k.id;
  select * into o from public.organizations where id = k.org_id;
  select full_name into v_name from public.people where id = k.person_id;

  select coalesce(jsonb_agg(x.j order by x.title), '[]'::jsonb) into v_props
  from (
    select p.title,
      jsonb_build_object(
        'reference', p.reference, 'title', p.title, 'property_type', p.property_type, 'purpose', p.purpose, 'status', p.status,
        'price_cents', p.price_cents, 'city', p.city, 'neighborhood', p.neighborhood,
        'online', p.is_published and public.mandate_is_active(p.id),
        'cover', (select ph.org_id::text || '/' || ph.property_id::text || '/' || ph.id::text from public.property_photos ph
                  where ph.property_id = p.id order by ph.is_cover desc, ph.created_at, ph.id limit 1),
        'mandate_until', (select max(m.valid_until) from public.property_mandates m where m.property_id = p.id and m.status = 'active'),
        'viewings_done', (select count(*) from public.viewings v where v.property_id = p.id and v.status = 'done'),
        'viewings_planned', (select count(*) from public.viewings v where v.property_id = p.id and v.status = 'scheduled' and v.scheduled_at >= now()),
        'interested', (select count(*) from public.viewings v where v.property_id = p.id and v.outcome in ('interested', 'offer_made')),
        'offers', (select count(*) from public.deals d where d.property_id = p.id and d.stage <> 'lost'),
        'page_views', (select coalesce(sum(s.views), 0) from public.page_stats s where s.property_id = p.id),
        'contacts', (select coalesce(sum(s.whatsapp + s.calls + s.forms), 0) from public.page_stats s where s.property_id = p.id),
        'sites', (select coalesce(jsonb_agg(po.site), '[]'::jsonb) from public.property_postings po where po.property_id = p.id and po.status = 'online'),
        'lease', (
          select jsonb_build_object('tenant', pe.full_name, 'rent_cents', l.rent_cents, 'start_date', l.start_date, 'end_date', l.end_date,
            'payments', (select coalesce(jsonb_agg(jsonb_build_object('due_date', r.due_date, 'amount_cents', r.amount_cents, 'status', r.status, 'paid_on', r.paid_on) order by r.due_date desc), '[]'::jsonb)
                         from public.rent_payments r where r.lease_id = l.id and r.status <> 'cancelled' and r.due_date > current_date - interval '12 months'))
          from public.leases l join public.people pe on pe.id = l.tenant_person_id
          where l.property_id = p.id and l.status = 'active' order by l.start_date desc limit 1),
        'repairs', (
          select coalesce(jsonb_agg(jsonb_build_object('title', mr.title, 'status', mr.status, 'reported_on', mr.reported_on, 'done_on', mr.done_on,
                                                       'cost_cents', mr.cost_cents, 'cost_borne_by', mr.cost_borne_by) order by mr.reported_on desc), '[]'::jsonb)
          from public.maintenance_requests mr where mr.property_id = p.id and mr.status <> 'cancelled' and mr.reported_on > current_date - interval '12 months')
      ) as j
    from public.properties p
    join public.property_parties pp on pp.property_id = p.id and pp.person_id = k.person_id and pp.role = 'owner'
    where p.org_id = k.org_id and p.status <> 'withdrawn'
  ) x;

  return jsonb_build_object(
    'owner', jsonb_build_object('name', v_name),
    'lang', k.lang,
    'office', jsonb_build_object('name', o.name, 'slug', o.slug, 'city', o.city, 'whatsapp', o.public_whatsapp, 'phone', o.public_phone, 'email', o.public_email),
    'properties', v_props,
    'generated_at', now()
  );
end $$;

alter table public.owner_links enable row level security;
create policy owner_links_select on public.owner_links
  for select to authenticated using (public.can_write(org_id) or (public.is_member(org_id) and public.my_role(org_id) <> 'viewer'));

revoke all on table public.owner_links from anon, authenticated;
grant select on public.owner_links to authenticated;

revoke all on function public.create_owner_link(uuid, text), public.revoke_owner_link(uuid), public.public_owner_portal(text) from public;
grant execute on function public.create_owner_link(uuid, text), public.revoke_owner_link(uuid) to authenticated;
grant execute on function public.public_owner_portal(text) to anon, authenticated;
