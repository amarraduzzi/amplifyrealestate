// Numbers for the owner overview. Pure functions (no database, no i18n), so they are easy to test.
import type { LeadStatus, MandateStatus, PropertyStatus, ViewingOutcome, ViewingStatus } from '@vastgoed/shared';

export type OvProperty = { id: string; title: string; reference: string; status: PropertyStatus; is_published: boolean };
export type OvMandate = { property_id: string; status: MandateStatus; valid_until: string | null };
export type OvLead = { status: LeadStatus; created_at: string };
export type OvViewing = { status: ViewingStatus; outcome: ViewingOutcome | null; scheduled_at: string };

export type OverviewInput = { properties: OvProperty[]; mandates: OvMandate[]; leads: OvLead[]; viewings: OvViewing[] };

/** A property in the list of mandates that need attention. `days` is days since the end (expired) or until the end (expiring). */
export type MandateAlert = { id: string; title: string; reference: string; days: number };

export type Overview = {
  properties: { byStatus: Record<PropertyStatus, number>; total: number; online: number };
  leads: { byStatus: Record<LeadStatus, number>; open: number; newWeek: number; newMonth: number };
  viewings: { upcoming: number; pastOpen: number; done30: number; noShow30: number; outcomes: Record<ViewingOutcome, number> };
  mandates: { expired: MandateAlert[]; missing: MandateAlert[]; expiring: MandateAlert[] };
};

export const EXPIRING_DAYS = 30;
const DAY = 86_400_000;

const PROPERTY_STATUSES: PropertyStatus[] = ['available', 'reserved', 'rented', 'sold', 'draft', 'withdrawn'];
const LEAD_STATUSES: LeadStatus[] = ['new', 'active', 'viewing', 'won', 'lost'];
const OUTCOMES: ViewingOutcome[] = ['interested', 'offer_made', 'not_interested'];

const zero = <K extends string>(keys: K[]) => Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;

/** Whole days from one YYYY-MM-DD date to another (dates without time, counted in UTC like the database does). */
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function computeOverview(input: OverviewInput, now: Date = new Date()): Overview {
  const today = now.toISOString().slice(0, 10);
  const t = now.getTime();

  // ---- Mandates, per property ------------------------------------------------------------
  const byProp = new Map<string, OvMandate[]>();
  for (const m of input.mandates) {
    const list = byProp.get(m.property_id);
    if (list) list.push(m); else byProp.set(m.property_id, [m]);
  }
  // Same rule as the database: active, and not past its end date.
  const isValid = (m: OvMandate) => m.status === 'active' && (m.valid_until === null || m.valid_until >= today);

  const expired: MandateAlert[] = [];
  const missing: MandateAlert[] = [];
  const expiring: MandateAlert[] = [];
  let online = 0;

  for (const p of input.properties) {
    // Only properties that are on offer matter here; a sold or withdrawn property needs no mandate.
    if (p.status !== 'available' && p.status !== 'reserved') continue;
    const ms = byProp.get(p.id) ?? [];
    const valid = ms.filter(isValid);
    const base = { id: p.id, title: p.title, reference: p.reference };

    if (valid.length > 0) {
      if (p.is_published) online++;
      // A mandate without an end date never runs out, so it cancels any end date of another one.
      if (valid.every(m => m.valid_until !== null)) {
        const end = valid.map(m => m.valid_until as string).sort().at(-1) as string;
        const left = dayDiff(today, end);
        if (left <= EXPIRING_DAYS) expiring.push({ ...base, days: left });
      }
      continue;
    }
    // No valid mandate: the latest end date of an ended mandate tells how long ago it expired.
    const ended = ms.filter(m => m.status === 'expired' || (m.status === 'active' && m.valid_until !== null && m.valid_until < today));
    if (ended.length > 0) {
      const dated = ended.map(m => m.valid_until).filter((d): d is string => d !== null).sort();
      expired.push({ ...base, days: dated.length ? dayDiff(dated[dated.length - 1], today) : 0 });
    } else {
      missing.push({ ...base, days: 0 });
    }
  }
  expired.sort((a, b) => b.days - a.days);
  expiring.sort((a, b) => a.days - b.days);
  missing.sort((a, b) => a.reference.localeCompare(b.reference));

  // ---- Properties -------------------------------------------------------------------------
  const pByStatus = zero(PROPERTY_STATUSES);
  for (const p of input.properties) pByStatus[p.status]++;

  // ---- Leads ------------------------------------------------------------------------------
  const lByStatus = zero(LEAD_STATUSES);
  let newWeek = 0, newMonth = 0;
  for (const l of input.leads) {
    lByStatus[l.status]++;
    const age = t - Date.parse(l.created_at);
    if (age <= 7 * DAY) newWeek++;
    if (age <= 30 * DAY) newMonth++;
  }

  // ---- Viewings ---------------------------------------------------------------------------
  let upcoming = 0, pastOpen = 0, done30 = 0, noShow30 = 0;
  const outcomes = zero(OUTCOMES);
  for (const v of input.viewings) {
    const at = Date.parse(v.scheduled_at);
    if (v.status === 'scheduled') {
      if (at >= t && at <= t + 7 * DAY) upcoming++;
      else if (at < t) pastOpen++;
    } else if (at <= t && at >= t - 30 * DAY) {
      if (v.status === 'done') {
        done30++;
        if (v.outcome) outcomes[v.outcome]++;
      } else if (v.status === 'no_show') noShow30++;
    }
  }

  return {
    properties: { byStatus: pByStatus, total: input.properties.length, online },
    leads: { byStatus: lByStatus, open: lByStatus.new + lByStatus.active + lByStatus.viewing, newWeek, newMonth },
    viewings: { upcoming, pastOpen, done30, noShow30, outcomes },
    mandates: { expired, missing, expiring },
  };
}
