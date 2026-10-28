import { supabase } from './supabase';
import { getLang } from './i18n';
import type { LeaseRow, PersonRow } from './types';

export type LeaseProp = { id: string; title: string; reference: string };

/** A lease together with the tenant and the property it is about. */
export type LeaseView = { l: LeaseRow; person: PersonRow | undefined; property: LeaseProp | undefined };

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/** Load the leases of an office (optionally of one property) with their names. */
export async function loadLeases(orgId: string, scope: { propertyId?: string } = {}): Promise<LeaseView[]> {
  let q = supabase.from('leases').select('*').eq('org_id', orgId).order('start_date', { ascending: false });
  if (scope.propertyId) q = q.eq('property_id', scope.propertyId);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  const rows = (r.data ?? []) as LeaseRow[];
  if (rows.length === 0) return [];
  const [pe, pr] = await Promise.all([
    supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', uniq(rows.map(x => x.tenant_person_id))),
    supabase.from('properties').select('id, title, reference').in('id', uniq(rows.map(x => x.property_id))),
  ]);
  if (pe.error) throw new Error(pe.error.message);
  if (pr.error) throw new Error(pr.error.message);
  const people = new Map(((pe.data ?? []) as PersonRow[]).map(x => [x.id, x]));
  const props = new Map(((pr.data ?? []) as LeaseProp[]).map(x => [x.id, x]));
  return rows.map(l => ({ l, person: people.get(l.tenant_person_id), property: props.get(l.property_id) }));
}

/** The database answers with short codes; show a sentence. Returns null when it is not a lease message. */
export function leaseError(message: string): string | null {
  if (message.includes('pand_is_geen_huurpand')) return 'This property is for sale, not for rent. Change its purpose first.';
  if (message.includes('leases_one_active_idx')) return 'This property already has a running lease. End that one first.';
  if (message.includes('leases_check') && message.includes('end_date')) return 'The end date cannot be before the start date.';
  return null;
}

/** Days from today until a YYYY-MM-DD date (negative = past). */
export function daysTo(date: string, today = new Date()): number {
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
/** A date without time, shown as written (never shifted by the time zone). */
export const dateText = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(d));
