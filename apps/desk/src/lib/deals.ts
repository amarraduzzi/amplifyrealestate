import type { DealPurpose, PropertyStatus } from '@vastgoed/shared';
import { supabase } from './supabase';
import type { DealRow, LeadRow, PersonRow, SplitRow } from './types';
import { loadSplitsFor } from './splits';

export type DealProp = { id: string; title: string; reference: string; purpose: DealPurpose; status: PropertyStatus; price_cents: number | null };

/** A deal together with the person (of the lead), the property it is about, and the shares for other agents. */
export type DealView = { d: DealRow; lead: LeadRow | undefined; person: PersonRow | undefined; property: DealProp | undefined; splits: SplitRow[] };

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/** Load the deals of an office (optionally of one lead or one property) with their names. */
export async function loadDeals(orgId: string, scope: { leadId?: string; propertyId?: string } = {}): Promise<DealView[]> {
  let q = supabase.from('deals').select('*').eq('org_id', orgId).order('stage_changed_at', { ascending: false });
  if (scope.leadId) q = q.eq('lead_id', scope.leadId);
  if (scope.propertyId) q = q.eq('property_id', scope.propertyId);
  const ds = await q;
  if (ds.error) throw new Error(ds.error.message);
  const rows = (ds.data ?? []) as DealRow[];
  if (rows.length === 0) return [];

  const [l, p, splits] = await Promise.all([
    supabase.from('leads').select('*').in('id', uniq(rows.map(r => r.lead_id))),
    supabase.from('properties').select('id, title, reference, purpose, status, price_cents').in('id', uniq(rows.map(r => r.property_id))),
    loadSplitsFor(rows.map(r => r.id)),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (p.error) throw new Error(p.error.message);
  const leads = (l.data ?? []) as LeadRow[];
  const people = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', uniq(leads.map(x => x.person_id)));
  if (people.error) throw new Error(people.error.message);

  const leadMap = new Map(leads.map(x => [x.id, x]));
  const personMap = new Map(((people.data ?? []) as PersonRow[]).map(x => [x.id, x]));
  const propMap = new Map(((p.data ?? []) as DealProp[]).map(x => [x.id, x]));
  return rows.map(d => {
    const lead = leadMap.get(d.lead_id);
    return { d, lead, person: lead ? personMap.get(lead.person_id) : undefined, property: propMap.get(d.property_id), splits: splits.filter(x => x.deal_id === d.id) };
  });
}

/** Text for an error from the database about a deal. */
export function dealError(message: string): string | null {
  return message.includes('deals_open_idx') ? 'There is already a deal for this lead and this property.' : null;
}
