import { supabase } from './supabase';
import { friendly } from './errors';
import type { LeadRow, MemberRow, PersonRow, TaskRow } from './types';

/** A task with the names of who it is for and what it is about. */
export type TaskView = { task: TaskRow; assignee: string | undefined; leadName: string | undefined; propertyTitle: string | undefined };

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

export async function loadMembers(orgId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase.rpc('list_members', { p_org: orgId });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemberRow[];
}

/** Load the tasks of an office (optionally only those of one lead or property) with their names. */
export async function loadTasks(orgId: string, scope: { leadId?: string; propertyId?: string } = {}): Promise<{ tasks: TaskView[]; members: MemberRow[] }> {
  let q = supabase.from('tasks').select('*').eq('org_id', orgId);
  if (scope.leadId) q = q.eq('lead_id', scope.leadId);
  if (scope.propertyId) q = q.eq('property_id', scope.propertyId);
  const [r, members] = await Promise.all([q, loadMembers(orgId)]);
  if (r.error) throw new Error(r.error.message);
  const rows = (r.data ?? []) as TaskRow[];

  const leadIds = uniq(rows.map(x => x.lead_id).filter((x): x is string => !!x));
  const propIds = uniq(rows.map(x => x.property_id).filter((x): x is string => !!x));
  const [l, p] = await Promise.all([
    leadIds.length ? supabase.from('leads').select('id, person_id').in('id', leadIds) : Promise.resolve({ data: [], error: null }),
    propIds.length ? supabase.from('properties').select('id, title').in('id', propIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (p.error) throw new Error(p.error.message);
  const leads = (l.data ?? []) as Pick<LeadRow, 'id' | 'person_id'>[];
  const ppl = leads.length
    ? await supabase.from('people').select('id, full_name').in('id', uniq(leads.map(x => x.person_id)))
    : { data: [], error: null };
  if (ppl.error) throw new Error(ppl.error.message);

  const person = new Map(((ppl.data ?? []) as Pick<PersonRow, 'id' | 'full_name'>[]).map(x => [x.id, x.full_name]));
  const leadName = new Map(leads.map(x => [x.id, person.get(x.person_id)]));
  const prop = new Map(((p.data ?? []) as { id: string; title: string }[]).map(x => [x.id, x.title]));
  const email = new Map(members.map(m => [m.user_id, m.email]));
  const tasks = rows.map(task => ({
    task,
    assignee: task.assigned_to ? email.get(task.assigned_to) : undefined,
    leadName: task.lead_id ? leadName.get(task.lead_id) : undefined,
    propertyTitle: task.property_id ? prop.get(task.property_id) : undefined,
  }));
  return { tasks, members };
}

/** Open tasks first (soonest deadline first, no deadline last), then the finished ones (latest first). */
export function sortTasks(list: TaskView[]): TaskView[] {
  const rank = (s: TaskRow['status']) => (s === 'open' ? 0 : 1);
  return [...list].sort((a, b) => {
    const r = rank(a.task.status) - rank(b.task.status);
    if (r) return r;
    if (a.task.status === 'open') return (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999') || a.task.created_at.localeCompare(b.task.created_at);
    return (b.task.completed_at ?? b.task.updated_at).localeCompare(a.task.completed_at ?? a.task.updated_at);
  });
}

/** Tick a task off, or open it again. Returns an error message, or null when it worked. */
export async function toggleTask(task: TaskRow): Promise<string | null> {
  const next = task.status === 'done' ? 'open' : 'done';
  const { data, error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id).select('id');
  if (error) return friendly(error);
  if (!data?.length) return 'You do not have permission to change this.';
  return null;
}
