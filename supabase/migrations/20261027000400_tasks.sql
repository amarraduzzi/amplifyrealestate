-- Amplify Vastgoed, etappe 1b-6: taken ("bel eigenaar", "stuur foto's")
--
-- Een taak heeft een titel, een deadline (datum), een verantwoordelijke uit het team en eventueel een
-- koppeling aan een lead en/of een pand. Zelfde regels als de rest: elke rij hoort bij een organisatie,
-- geen verwijderen (status 'cancelled' gebruiken), verwijzen over organisaties heen kan niet.

create type public.task_status as enum ('open', 'done', 'cancelled');

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  title        text not null check (char_length(title) between 1 and 200),
  notes        text,
  due_date     date,
  status       public.task_status not null default 'open',
  assigned_to  uuid references auth.users(id) on delete set null,
  lead_id      uuid,
  property_id  uuid,
  completed_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (lead_id, org_id)     references public.leads (id, org_id),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  check ((status = 'done') = (completed_at is not null))
);
create index tasks_org_status_due_idx on public.tasks (org_id, status, due_date);
create index tasks_assigned_idx       on public.tasks (assigned_to) where status = 'open';
create index tasks_lead_idx           on public.tasks (lead_id);
create index tasks_property_idx       on public.tasks (property_id);

-- completed_at volgt de status: gevuld zodra een taak op 'done' komt, leeg als hij weer opengaat
create function public.tasks_set_completed()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

-- Een taak kan alleen aan iemand van hetzelfde kantoor toegewezen worden
create function public.tasks_check_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null
     and not exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.assigned_to) then
    raise exception 'verantwoordelijke_is_geen_lid' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger tasks_completed     before insert or update on public.tasks
  for each row execute function public.tasks_set_completed();
create trigger tasks_assignee      before insert or update of assigned_to on public.tasks
  for each row execute function public.tasks_check_assignee();
create trigger tasks_touch         before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger tasks_org_lock      before update on public.tasks
  for each row execute function public.forbid_org_change();
create trigger tasks_created_by    before insert on public.tasks
  for each row execute function public.set_created_by();

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated using (public.is_member(org_id));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (public.can_write(org_id));
create policy tasks_update on public.tasks
  for update to authenticated using (public.can_write(org_id)) with check (public.can_write(org_id));

revoke all on table public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;
grant insert, update on public.tasks to authenticated;

revoke all on function public.tasks_set_completed(), public.tasks_check_assignee() from public, anon, authenticated;

-- Verwijder je een lid, dan worden zijn open taken weer "van niemand" in plaats van aan een vreemde te hangen.
create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller public.org_role;
  v_target public.org_role;
begin
  v_caller := public.my_role(p_org);
  if v_caller is null then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;
  if p_user is distinct from auth.uid() and v_caller not in ('owner', 'manager') then
    raise exception 'niet_toegestaan' using errcode = '42501';
  end if;

  select role into v_target from public.memberships where org_id = p_org and user_id = p_user;
  if v_target is null then
    raise exception 'lid_niet_gevonden' using errcode = 'P0002';
  end if;
  if v_target = 'owner' then
    if p_user is distinct from auth.uid() and v_caller <> 'owner' then
      raise exception 'alleen_eigenaar_mag_eigenaar_verwijderen' using errcode = '42501';
    end if;
    if (select count(*) from public.memberships where org_id = p_org and role = 'owner') = 1 then
      raise exception 'laatste_eigenaar' using errcode = '23514';
    end if;
  end if;

  update public.tasks set assigned_to = null
  where org_id = p_org and assigned_to = p_user and status = 'open';
  delete from public.memberships where org_id = p_org and user_id = p_user;
end $$;
