-- Amplify Vastgoed, etappe 6d: multi-posting (advertenties op Mubawab, Avito, Facebook en andere sites)
--
-- De app maakt per pand de teksten en foto's klaar om te plakken op een advertentiesite. Deze tabel onthoudt waar
-- het pand online staat, met de datum en de link, zodat het team (en de eigenaar in het rapport) dat ziet, en zodat
-- Today waarschuwt als een pand verkocht of verhuurd is terwijl de advertentie nog online staat.
--
-- Regels:
--  * Per pand en site hooguit een regel. Status online of removed (offline gehaald); niets wordt verwijderd.
--  * Eigenaar, manager en agent kunnen toevoegen en wijzigen, niet na afloop van het plan (can_write). Lezen: alle leden.

create type public.posting_site as enum ('mubawab', 'avito', 'facebook', 'instagram', 'sarouty', 'other');
create type public.posting_status as enum ('online', 'removed');

create table public.property_postings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  property_id  uuid not null,
  site         public.posting_site not null,
  status       public.posting_status not null default 'online',
  posted_on    date not null default current_date,
  removed_on   date,
  url          text check (url is null or char_length(url) <= 500),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, site),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  check ((status = 'removed') = (removed_on is not null))
);
create index property_postings_org_idx on public.property_postings (org_id, status);

-- removed_on volgt de status (standaard vandaag)
create function public.postings_set_removed()
returns trigger language plpgsql as $$
begin
  if new.status = 'removed' then
    new.removed_on := coalesce(new.removed_on, current_date);
  else
    new.removed_on := null;
  end if;
  return new;
end $$;

create trigger postings_touch       before update on public.property_postings
  for each row execute function public.touch_updated_at();
create trigger postings_org_lock    before update on public.property_postings
  for each row execute function public.forbid_org_change();
create trigger postings_created_by  before insert on public.property_postings
  for each row execute function public.set_created_by();
create trigger postings_set_removed before insert or update on public.property_postings
  for each row execute function public.postings_set_removed();

alter table public.property_postings enable row level security;
create policy postings_select on public.property_postings
  for select to authenticated using (public.is_member(org_id));
create policy postings_insert on public.property_postings
  for insert to authenticated with check (public.can_write(org_id));
create policy postings_update on public.property_postings
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.property_postings from anon, authenticated;
grant select on public.property_postings to authenticated;
grant insert (org_id, property_id, site, status, posted_on, url) on public.property_postings to authenticated;
grant update (status, posted_on, removed_on, url) on public.property_postings to authenticated;

revoke all on function public.postings_set_removed() from public, anon, authenticated;
