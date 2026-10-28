-- Amplify Vastgoed, etappe 7c: état des lieux (bij intrek en vertrek)
--
-- Bij een huurovereenkomst maakt het kantoor een état des lieux d'entrée en later een état des lieux de sortie:
-- per kamer de onderdelen (muren, vloer, ramen, ...) met hun staat en een opmerking, foto's per kamer, de meterstanden,
-- de sleutels, en de handtekening van de huurder en van het kantoor op het scherm.
--
-- Regels:
--  * Per huurovereenkomst hooguit een état des lieux d'entrée en een de sortie.
--  * Zolang hij niet ondertekend is, kan hij gewijzigd worden. Na ondertekening (sign_inspection) ligt alles vast:
--    inhoud, meterstanden, handtekeningen en foto's.
--  * Foto's staan in een privé-opslag (inspection-photos), net als de documenten bij een deal: alleen eigenaar, manager
--    en agent van het kantoor zien ze, via een tijdelijke link.
--  * Aanmaken en wijzigen: eigenaar, manager en agent (can_write), niet na afloop van het plan. Viewers zien ze niet.

create type public.inspection_kind as enum ('entry', 'exit');
create type public.inspection_status as enum ('draft', 'signed');

create table public.inspections (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id),
  lease_id           uuid not null,
  kind               public.inspection_kind not null,
  inspected_on       date not null default current_date,
  rooms              jsonb not null default '[]'::jsonb check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) <= 30),
  meters             jsonb not null default '{}'::jsonb check (jsonb_typeof(meters) = 'object'),
  keys_note          text check (keys_note is null or char_length(keys_note) <= 500),
  general_note       text check (general_note is null or char_length(general_note) <= 2000),
  status             public.inspection_status not null default 'draft',
  tenant_name        text check (tenant_name is null or char_length(tenant_name) <= 200),
  tenant_signature   text check (tenant_signature is null or (char_length(tenant_signature) <= 300000 and tenant_signature like 'data:image/png;base64,%')),
  agent_name         text check (agent_name is null or char_length(agent_name) <= 200),
  agent_signature    text check (agent_signature is null or (char_length(agent_signature) <= 300000 and agent_signature like 'data:image/png;base64,%')),
  signed_at          timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id),
  unique (lease_id, kind),
  foreign key (lease_id, org_id) references public.leases (id, org_id),
  check ((status = 'signed') = (signed_at is not null)),
  check (status = 'draft' or (tenant_signature is not null and agent_signature is not null))
);
create index inspections_org_idx on public.inspections (org_id, inspected_on desc);

create table public.inspection_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  inspection_id uuid not null,
  room          smallint not null check (room between 0 and 29),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  foreign key (inspection_id, org_id) references public.inspections (id, org_id)
);
create index inspection_photos_idx on public.inspection_photos (inspection_id, room, created_at);

create trigger inspections_touch    before update on public.inspections for each row execute function public.touch_updated_at();
create trigger inspections_org_lock before update on public.inspections for each row execute function public.forbid_org_change();
create trigger inspections_by       before insert on public.inspections for each row execute function public.set_created_by();
create trigger inspection_photos_by before insert on public.inspection_photos for each row execute function public.set_created_by();

-- Na ondertekening ligt alles vast
create function public.inspections_lock()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then
    raise exception 'inspection_signed' using errcode = '23514';
  end if;
  if new.lease_id <> old.lease_id or new.kind <> old.kind then
    raise exception 'inspection_fixed_links' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger inspections_lock before update on public.inspections for each row execute function public.inspections_lock();

create function public.inspection_photos_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.inspection_id, old.inspection_id);
begin
  if exists (select 1 from public.inspections where id = v_id and status = 'signed') then
    raise exception 'inspection_signed' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger inspection_photos_lock before insert or delete on public.inspection_photos
  for each row execute function public.inspection_photos_lock();

-- Ondertekenen: beide handtekeningen tegelijk, daarna vast
create function public.sign_inspection(p_id uuid, p_tenant_name text, p_tenant_signature text, p_agent_name text, p_agent_signature text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.inspections;
begin
  select * into i from public.inspections where id = p_id;
  if i.id is not null and public.is_member(i.org_id) and not public.org_is_open(i.org_id) then
    raise exception 'plan_expired' using errcode = '42501';
  end if;
  if i.id is null or not public.can_write(i.org_id) then
    raise exception 'You do not have permission to change this.' using errcode = '42501';
  end if;
  if i.status = 'signed' then
    raise exception 'inspection_signed' using errcode = '23514';
  end if;
  if coalesce(p_tenant_signature, '') not like 'data:image/png;base64,%' or coalesce(p_agent_signature, '') not like 'data:image/png;base64,%' then
    raise exception 'inspection_signatures_missing' using errcode = '22023';
  end if;
  update public.inspections
     set tenant_name = nullif(trim(coalesce(p_tenant_name, '')), ''), tenant_signature = p_tenant_signature,
         agent_name = nullif(trim(coalesce(p_agent_name, '')), ''), agent_signature = p_agent_signature,
         status = 'signed', signed_at = now()
   where id = p_id;
end $$;

alter table public.inspections enable row level security;
alter table public.inspection_photos enable row level security;

create policy inspections_select on public.inspections
  for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy inspections_insert on public.inspections
  for insert to authenticated with check (public.can_write(org_id));
create policy inspections_update on public.inspections
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

create policy inspection_photos_select on public.inspection_photos
  for select to authenticated using (public.is_member(org_id) and public.my_role(org_id) <> 'viewer');
create policy inspection_photos_insert on public.inspection_photos
  for insert to authenticated with check (public.can_write(org_id));
create policy inspection_photos_delete on public.inspection_photos
  for delete to authenticated using (public.can_write(org_id));

revoke all on table public.inspections, public.inspection_photos from anon, authenticated;
grant select on public.inspections, public.inspection_photos to authenticated;
grant insert (org_id, lease_id, kind, inspected_on, rooms, meters, keys_note, general_note) on public.inspections to authenticated;
grant update (inspected_on, rooms, meters, keys_note, general_note) on public.inspections to authenticated;
grant insert (id, org_id, inspection_id, room) on public.inspection_photos to authenticated;
grant delete on public.inspection_photos to authenticated;

revoke all on function public.inspections_lock(), public.inspection_photos_lock() from public, anon, authenticated;
revoke all on function public.sign_inspection(uuid, text, text, text, text) from public, anon;
grant execute on function public.sign_inspection(uuid, text, text, text, text) to authenticated;

-- Privé-opslag voor de foto's: pad {kantoor}/{état des lieux}/{foto}.jpg; zelfde rechten als de dealdocumenten
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

create policy inspection_photos_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'inspection-photos' and public.storage_doc_read_ok(name));
create policy inspection_photos_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'inspection-photos' and public.storage_doc_write_ok(name));
create policy inspection_photos_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'inspection-photos' and public.storage_doc_write_ok(name));
