import { formatMad } from '@vastgoed/shared';
import { supabase } from './supabase';
import type { ShareLang } from './publicSite';
import { daysTo, loadLeases } from './leases';

export type PaymentStatus = 'due' | 'paid' | 'cancelled';
export type PaymentRow = {
  id: string;
  org_id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: PaymentStatus;
  paid_on: string | null;
  note: string | null;
  reminded_on: string | null;
};

const COLUMNS = 'id, org_id, lease_id, due_date, amount_cents, status, paid_on, note, reminded_on';

/** Ask the database to create the rent lines that are due (safe to repeat). Silent when the function is not installed yet. */
export async function ensureRentDue(orgId: string): Promise<void> {
  try { await supabase.rpc('generate_rent_due', { p_org: orgId }); } catch { /* the app works without it */ }
}

/** All rent lines of one lease, newest first. */
export async function loadPayments(leaseId: string): Promise<PaymentRow[]> {
  const r = await supabase.from('rent_payments').select(COLUMNS).eq('lease_id', leaseId).order('due_date', { ascending: false });
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as PaymentRow[];
}

/** The unpaid rent lines of the whole office (a few per lease at most). Empty when the table is not installed yet. */
export async function loadOpenPayments(orgId: string): Promise<PaymentRow[]> {
  const r = await supabase.from('rent_payments').select(COLUMNS).eq('org_id', orgId).eq('status', 'due');
  if (r.error) return [];
  return (r.data ?? []) as PaymentRow[];
}

/** Today as YYYY-MM-DD in the local time zone. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Unpaid and past its due date. */
export const isOverdue = (p: PaymentRow, today = todayIso()) => p.status === 'due' && p.due_date < today;

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const dateIn = (lang: ShareLang, d: string) => new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(d));

// The reminder goes to the tenant in the tenant's language, which can differ from the app language: texts live here.
const W = {
  fr: {
    late: (n: string, a: string, p: string, d: string) => `Bonjour ${n}, petit rappel : le loyer de ${a} pour « ${p} » était dû le ${d}. Merci de me confirmer le paiement.`,
    soon: (n: string, a: string, p: string, d: string) => `Bonjour ${n}, petit rappel : le loyer de ${a} pour « ${p} » est dû le ${d}. Merci !`,
  },
  ar: {
    late: (n: string, a: string, p: string, d: string) => `مرحبا ${n}، تذكير بسيط: كراء ${a} الخاص بـ «${p}» كان مستحقا بتاريخ ${d}. المرجو تأكيد الأداء.`,
    soon: (n: string, a: string, p: string, d: string) => `مرحبا ${n}، تذكير بسيط: كراء ${a} الخاص بـ «${p}» مستحق بتاريخ ${d}. شكرا!`,
  },
  en: {
    late: (n: string, a: string, p: string, d: string) => `Hello ${n}, a friendly reminder: the rent of ${a} for "${p}" was due on ${d}. Please confirm the payment.`,
    soon: (n: string, a: string, p: string, d: string) => `Hello ${n}, a friendly reminder: the rent of ${a} for "${p}" is due on ${d}. Thank you!`,
  },
};

/** WhatsApp text that reminds a tenant of one unpaid month. */
export function reminderMessage(o: { lang: ShareLang; name: string; property: string; payment: PaymentRow; office: string }): string {
  const w = W[o.lang];
  const f = isOverdue(o.payment) ? w.late : w.soon;
  return `${f(o.name, formatMad(o.payment.amount_cents), o.property, dateIn(o.lang, o.payment.due_date))}\n— ${o.office}`;
}

export type RentAlert = { id: string; leaseId: string; name: string; property: string; cents: number; days: number };

/** Unpaid rent that is past its due date, with tenant and property, longest overdue first. Empty when the tables are not installed yet. */
export async function loadRentAlerts(orgId: string, generate: boolean): Promise<RentAlert[]> {
  try {
    if (generate) await ensureRentDue(orgId);
    const late = (await loadOpenPayments(orgId)).filter(p => isOverdue(p));
    if (late.length === 0) return [];
    const byLease = new Map((await loadLeases(orgId)).map(v => [v.l.id, v]));
    return late
      .map(p => { const v = byLease.get(p.lease_id); return { id: p.id, leaseId: p.lease_id, name: v?.person?.full_name ?? '…', property: v?.property?.title ?? '…', cents: p.amount_cents, days: -daysTo(p.due_date) }; })
      .sort((a, b) => b.days - a.days);
  } catch { return []; }
}
