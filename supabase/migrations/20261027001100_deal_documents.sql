-- Amplify Vastgoed, etappe 2h: documenten bij een deal (contract, mandaat, betaalbewijs)
--
-- Ontwerpkeuzes:
--  * Documenten bevatten persoonsgegevens en afspraken over geld. Ze staan daarom in een PRIVE-bucket
--    'deal-documents' (niet openbaar): openen kan alleen via een tijdelijke link die de desk voor een lid aanmaakt.
--  * Wie mag wat: eigenaar, manager en agent mogen documenten zien (ook als het plan is afgelopen: lezen blijft).
--    Een viewer ziet ze niet. Uploaden mag als je kunt schrijven (rol + plan open). Verwijderen alleen eigenaar
--    en manager, en alleen als het plan open is.
--  * Maximaal 20 documenten per deal, 10 MB per bestand, alleen PDF, JPEG, PNG of WebP.
--  * Bewust geen soort "identiteitsbewijs": kopieen van id-kaarten horen niet in dit systeem zolang de regels
--    voor gegevensbescherming (wet 09-08, CNDP) niet door een jurist zijn bekeken.
--  * Elk document heeft een naam en een soort (contract, mandaat, betaalbewijs, overig). Wie het uploadde en wanneer
--    wordt bewaard.

create table public.deal_documents (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  deal_id    uuid not null,
  kind       text not null default 'other' check (kind in ('contract', 'mandate', 'receipt', 'other')),
  file_name  text not null check (char_length(file_name) between 1 and 200),
  mime_type  text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (deal_id, org_id) references public.deals (id, org_id)
);
create index deal_documents_deal_idx on public.deal_documents (deal_id, created_at);

create function public.deal_documents_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.deal_documents where deal_id = new.deal_id) >= 20 then
    raise exception 'maximaal_20_documenten' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.deal_documents_limit() from public, anon, authenticated;

create trigger deal_documents_limit      before insert on public.deal_documents
  for each row execute function public.deal_documents_limit();
create trigger deal_documents_created_by before insert on public.deal_documents
  for each row execute function public.set_created_by();

-- Rol zonder plancontrole: eigenaar, manager en agent mogen documenten lezen
create function public.can_read_documents(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'manager', 'agent')
  )
$$;
revoke all on function public.can_read_documents(uuid) from public, anon;
grant execute on function public.can_read_documents(uuid) to authenticated;

alter table public.deal_documents enable row level security;
create policy deal_documents_select on public.deal_documents
  for select to authenticated using (public.can_read_documents(org_id));
create policy deal_documents_insert on public.deal_documents
  for insert to authenticated with check (public.can_write(org_id));
create policy deal_documents_delete on public.deal_documents
  for delete to authenticated using (public.can_manage(org_id) and public.org_is_open(org_id));

revoke all on table public.deal_documents from anon, authenticated;
grant select, insert, delete on public.deal_documents to authenticated;

-- ---------------------------------------------------------------------------
-- Opslag (Supabase Storage): prive bucket, pad = {kantoor}/{deal}/{document}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-documents', 'deal-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Het eerste deel van het pad is het kantoor
create function public.storage_doc_org(p_name text)
returns uuid language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end
$$;

create function public.storage_doc_read_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_read_documents(public.storage_doc_org(p_name)), false)
$$;
create function public.storage_doc_write_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_write(public.storage_doc_org(p_name)), false)
$$;
create function public.storage_doc_delete_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.can_manage(public.storage_doc_org(p_name)) and public.org_is_open(public.storage_doc_org(p_name)), false)
$$;
revoke all on function public.storage_doc_org(text), public.storage_doc_read_ok(text),
  public.storage_doc_write_ok(text), public.storage_doc_delete_ok(text) from public, anon;
grant execute on function public.storage_doc_org(text), public.storage_doc_read_ok(text),
  public.storage_doc_write_ok(text), public.storage_doc_delete_ok(text) to authenticated;

create policy deal_docs_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'deal-documents' and public.storage_doc_read_ok(name));
create policy deal_docs_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'deal-documents' and public.storage_doc_write_ok(name));
create policy deal_docs_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'deal-documents' and public.storage_doc_delete_ok(name));
