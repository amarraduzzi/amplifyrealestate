import { formatMad } from '@vastgoed/shared';
import { supabase } from './supabase';
import { t } from './i18n';
import type { PersonRow } from './types';
import type { ShareLang } from './publicSite';
import { daysTo } from './leases';

export type MaintStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type MaintPriority = 'low' | 'normal' | 'urgent';
export type CostBy = 'owner' | 'tenant' | 'agency';

export type MaintRow = {
  id: string; org_id: string; property_id: string;
  reported_by_person_id: string | null; assigned_person_id: string | null;
  title: string; description: string | null;
  priority: MaintPriority; status: MaintStatus;
  reported_on: string; done_on: string | null;
  cost_cents: number | null; cost_borne_by: CostBy | null;
};

export type MaintProp = { id: string; title: string; reference: string };
export type MaintView = { m: MaintRow; property: MaintProp | undefined; reporter: PersonRow | undefined; contractor: PersonRow | undefined };

export const MAINT_STATUSES: MaintStatus[] = ['open', 'in_progress', 'done', 'cancelled'];
export const MAINT_PRIORITIES: MaintPriority[] = ['urgent', 'normal', 'low'];
export const COST_BY: CostBy[] = ['owner', 'tenant', 'agency'];

export const maintStatusLabel = (s: MaintStatus) => t(({ open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' } as const)[s]);
export const priorityLabel = (p: MaintPriority) => t(({ low: 'Low', normal: 'Normal', urgent: 'Urgent' } as const)[p]);
export const costByLabel = (c: CostBy) => t(({ owner: 'Owner', tenant: 'Tenant', agency: 'Agency' } as const)[c]);

export const maintStatusCls: Record<MaintStatus, string> = {
  open: 'bg-warn/10 text-warn', in_progress: 'bg-brand/10 text-brand', done: 'bg-ok/10 text-ok', cancelled: 'bg-surface-3 text-muted',
};
export const priorityCls: Record<MaintPriority, string> = {
  urgent: 'bg-danger/10 text-danger', normal: 'bg-surface-3 text-muted', low: 'bg-surface-3 text-muted',
};

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
const PERSON = 'id, full_name, phone, whatsapp, email';

/** Load the maintenance requests of an office (optionally of one property) with the names that belong to them. */
export async function loadMaintenance(orgId: string, scope: { propertyId?: string } = {}): Promise<MaintView[]> {
  let q = supabase.from('maintenance_requests').select('*').eq('org_id', orgId).order('reported_on', { ascending: false }).order('created_at', { ascending: false });
  if (scope.propertyId) q = q.eq('property_id', scope.propertyId);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  const rows = (r.data ?? []) as MaintRow[];
  if (rows.length === 0) return [];
  const personIds = uniq(rows.flatMap(x => [x.reported_by_person_id, x.assigned_person_id]).filter((x): x is string => !!x));
  const [pe, pr] = await Promise.all([
    personIds.length ? supabase.from('people').select(PERSON).in('id', personIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('properties').select('id, title, reference').in('id', uniq(rows.map(x => x.property_id))),
  ]);
  if (pe.error) throw new Error(pe.error.message);
  if (pr.error) throw new Error(pr.error.message);
  const people = new Map(((pe.data ?? []) as PersonRow[]).map(x => [x.id, x]));
  const props = new Map(((pr.data ?? []) as MaintProp[]).map(x => [x.id, x]));
  return rows.map(m => ({
    m, property: props.get(m.property_id),
    reporter: m.reported_by_person_id ? people.get(m.reported_by_person_id) : undefined,
    contractor: m.assigned_person_id ? people.get(m.assigned_person_id) : undefined,
  }));
}

export const isOpen = (s: MaintStatus) => s === 'open' || s === 'in_progress';

// The message goes to the repairer in the repairer's language, which can differ from the app language: texts live here.
type Compose = (n: string, p: string, title: string, desc: string, urgent: boolean, office: string) => string;
const W: Record<ShareLang, Compose> = {
  fr: (n: string, p: string, title: string, desc: string, urgent: boolean, office: string) =>
    `Bonjour ${n}, un problème${urgent ? ' urgent' : ''} est signalé au bien « ${p} » : ${title}.${desc ? `\n${desc}` : ''}\nPourriez-vous passer le voir et me donner un devis ? Merci.\n— ${office}`,
  ar: (n: string, p: string, title: string, desc: string, urgent: boolean, office: string) =>
    `مرحبا ${n}، تم التبليغ عن مشكل${urgent ? ' مستعجل' : ''} في العقار «${p}»: ${title}.${desc ? `\n${desc}` : ''}\nهل يمكنك المرور لمعاينته وتزويدي بتقدير للكلفة؟ شكرا.\n— ${office}`,
  en: (n: string, p: string, title: string, desc: string, urgent: boolean, office: string) =>
    `Hello ${n}, ${urgent ? 'an urgent ' : 'a '}problem has been reported at "${p}": ${title}.${desc ? `\n${desc}` : ''}\nCould you take a look and give me a quote? Thank you.\n— ${office}`,
};

/** WhatsApp text for the person who has to fix it. */
export function repairMessage(o: { lang: ShareLang; name: string; property: string; m: MaintRow; office: string }): string {
  return W[o.lang](o.name, o.property, o.m.title, (o.m.description ?? '').trim(), o.m.priority === 'urgent', o.office);
}

export const costText = (m: MaintRow) => (m.cost_cents === null ? '—' : formatMad(m.cost_cents));

export type RepairAlert = { id: string; title: string; property: string; urgent: boolean; days: number };
const STALE_DAYS = 7;

/** Open requests that are urgent or have been waiting a week or more, urgent first. Empty when the table is not installed yet. */
export async function loadRepairAlerts(orgId: string): Promise<RepairAlert[]> {
  try {
    return (await loadMaintenance(orgId))
      .filter(r => isOpen(r.m.status))
      .map(r => ({ id: r.m.id, title: r.m.title, property: r.property?.title ?? '…', urgent: r.m.priority === 'urgent', days: Math.max(0, -daysTo(r.m.reported_on)) }))
      .filter(r => r.urgent || r.days >= STALE_DAYS)
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.days - a.days);
  } catch { return []; }
}
