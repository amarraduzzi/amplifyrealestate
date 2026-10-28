import { supabase } from './supabase';
import { getLang } from './i18n';
import { toInputValue } from './dates';
import { loadTasks, type TaskView } from './tasks';
import { loadViewings, type ViewingView } from './viewings';
import { ensureRentDue, loadOpenPayments, type PaymentRow } from './payments';
import { loadLeases, type LeaseView } from './leases';

/** One line in the agenda. Viewings and tasks can be opened; the rest points to the right tab. */
export type AgendaItem =
  | { kind: 'viewing'; day: string; time: string; item: ViewingView }
  | { kind: 'task'; day: string; item: TaskView }
  | { kind: 'mandate'; day: string; propertyId: string; title: string; reference: string }
  | { kind: 'rent'; day: string; payment: PaymentRow; tenant: string; title: string }
  | { kind: 'lease_end'; day: string; lease: LeaseView };

export type AgendaData = { items: AgendaItem[] };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** YYYY-MM-DD of a Date in local time. */
export const dayKey = (d: Date) => toInputValue(d).slice(0, 10);

/** Monday of the week of a date (weeks start on Monday, as in Morocco and France). */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - wd);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** "Mon 27" style label for a day column. */
export const dayLabel = (d: Date) => ({
  weekday: new Intl.DateTimeFormat(LOCALES[getLang()], { weekday: 'short' }).format(d),
  date: new Intl.DateTimeFormat(LOCALES[getLang()], { day: 'numeric', month: 'short' }).format(d),
});

/** "27 Oct - 2 Nov 2026" for the week (the year once, unless the week crosses New Year). */
export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const full = new Intl.DateTimeFormat(LOCALES[getLang()], { day: 'numeric', month: 'short', year: 'numeric' });
  const short = new Intl.DateTimeFormat(LOCALES[getLang()], { day: 'numeric', month: 'short' });
  return `${(start.getFullYear() === end.getFullYear() ? short : full).format(start)} - ${full.format(end)}`;
}

const timeOf = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Everything with a date: viewings, tasks with a deadline, mandates that end, unpaid rent and leases that end. */
export async function loadAgenda(orgId: string, canWrite: boolean): Promise<AgendaData> {
  if (canWrite) await ensureRentDue(orgId);
  const [vw, tk, md, pay, leases] = await Promise.all([
    loadViewings(orgId),
    loadTasks(orgId),
    supabase.from('property_mandates').select('property_id, valid_until').eq('org_id', orgId).eq('status', 'active').not('valid_until', 'is', null),
    loadOpenPayments(orgId),
    loadLeases(orgId).catch(() => [] as LeaseView[]), // works without the rentals tables
  ]);
  if (md.error) throw new Error(md.error.message);

  const items: AgendaItem[] = [];
  for (const v of vw) {
    if (v.v.status === 'cancelled') continue;
    items.push({ kind: 'viewing', day: dayKey(new Date(v.v.scheduled_at)), time: timeOf(v.v.scheduled_at), item: v });
  }
  for (const x of tk.tasks) {
    if (x.task.due_date && x.task.status !== 'cancelled') items.push({ kind: 'task', day: x.task.due_date, item: x });
  }

  // A property can have more than one active mandate: keep the one that runs longest.
  const mandates = new Map<string, string>();
  for (const m of (md.data ?? []) as { property_id: string; valid_until: string }[]) {
    const cur = mandates.get(m.property_id);
    if (!cur || m.valid_until > cur) mandates.set(m.property_id, m.valid_until);
  }
  if (mandates.size) {
    const pr = await supabase.from('properties').select('id, title, reference, status').in('id', [...mandates.keys()]);
    if (pr.error) throw new Error(pr.error.message);
    for (const p of (pr.data ?? []) as { id: string; title: string; reference: string; status: string }[]) {
      const until = mandates.get(p.id);
      if (!until || p.status === 'sold' || p.status === 'withdrawn') continue;
      items.push({ kind: 'mandate', day: until, propertyId: p.id, title: p.title, reference: p.reference });
    }
  }

  const byLease = new Map(leases.map(l => [l.l.id, l]));
  for (const p of pay) {
    const l = byLease.get(p.lease_id);
    items.push({ kind: 'rent', day: p.due_date, payment: p, tenant: l?.person?.full_name ?? '…', title: l?.property?.title ?? '…' });
  }
  for (const l of leases) {
    if (l.l.status === 'active' && l.l.end_date) items.push({ kind: 'lease_end', day: l.l.end_date, lease: l });
  }

  const rank: Record<AgendaItem['kind'], number> = { viewing: 0, task: 1, rent: 2, mandate: 3, lease_end: 4 };
  items.sort((a, b) => a.day.localeCompare(b.day) || rank[a.kind] - rank[b.kind]
    || (a.kind === 'viewing' && b.kind === 'viewing' ? a.item.v.scheduled_at.localeCompare(b.item.v.scheduled_at) : 0));
  return { items };
}
