// Money figures for the owner report. Pure functions (no database, no i18n).

export type FinPayment = { due_date: string; amount_cents: number; status: 'due' | 'paid' | 'cancelled' };
export type FinRepair = { status: 'open' | 'in_progress' | 'done' | 'cancelled'; cost_cents: number | null; cost_borne_by: 'owner' | 'tenant' | 'agency' | null; done_on: string | null; reported_on: string };

export type Finance = {
  collected: number;     // rent that was paid (due date in the period)
  outstanding: number;   // rent that is past its due date and not paid
  repairCosts: number;   // cost of repairs that were finished in the period
  ownerCosts: number;    // of which paid by the owner
  openRepairs: number;
  afterRepairs: number;  // collected rent minus the repair costs paid by the owner (before any agency fees)
};

/** The start of the period: one year before `today` (YYYY-MM-DD). */
export const periodStart = (today: string) => `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;

export function computeFinance(payments: FinPayment[], repairs: FinRepair[], today: string): Finance {
  const from = periodStart(today);
  const inPeriod = payments.filter(p => p.due_date >= from && p.due_date <= today);
  const collected = inPeriod.filter(p => p.status === 'paid').reduce((n, p) => n + p.amount_cents, 0);
  const outstanding = inPeriod.filter(p => p.status === 'due').reduce((n, p) => n + p.amount_cents, 0);
  const done = repairs.filter(r => r.status === 'done' && (r.done_on ?? r.reported_on) >= from);
  const repairCosts = done.reduce((n, r) => n + (r.cost_cents ?? 0), 0);
  const ownerCosts = done.filter(r => r.cost_borne_by === 'owner').reduce((n, r) => n + (r.cost_cents ?? 0), 0);
  const openRepairs = repairs.filter(r => r.status === 'open' || r.status === 'in_progress').length;
  return { collected, outstanding, repairCosts, ownerCosts, openRepairs, afterRepairs: collected - ownerCosts };
}
