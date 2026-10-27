import { supabase } from './supabase';
import type { LeadRow, PersonRow, ViewingRow } from './types';

export type ViewingProp = { id: string; title: string; reference: string };

/** A viewing together with the lead, person and property it is about. */
export type ViewingView = { v: ViewingRow; lead: LeadRow | undefined; person: PersonRow | undefined; property: ViewingProp | undefined };

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/** Load viewings of an office (optionally only those of one lead or one property) with their names. */
export async function loadViewings(orgId: string, scope: { leadId?: string; propertyId?: string } = {}): Promise<ViewingView[]> {
  let q = supabase.from('viewings').select('*').eq('org_id', orgId).order('scheduled_at', { ascending: true });
  if (scope.leadId) q = q.eq('lead_id', scope.leadId);
  if (scope.propertyId) q = q.eq('property_id', scope.propertyId);
  const vs = await q;
  if (vs.error) throw new Error(vs.error.message);
  const rows = (vs.data ?? []) as ViewingRow[];
  if (rows.length === 0) return [];

  const leadIds = uniq(rows.map(r => r.lead_id));
  const propIds = uniq(rows.map(r => r.property_id));
  const [l, p] = await Promise.all([
    supabase.from('leads').select('*').in('id', leadIds),
    supabase.from('properties').select('id, title, reference').in('id', propIds),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (p.error) throw new Error(p.error.message);
  const leads = (l.data ?? []) as LeadRow[];
  const people = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', uniq(leads.map(x => x.person_id)));
  if (people.error) throw new Error(people.error.message);

  const leadMap = new Map(leads.map(x => [x.id, x]));
  const personMap = new Map(((people.data ?? []) as PersonRow[]).map(x => [x.id, x]));
  const propMap = new Map(((p.data ?? []) as ViewingProp[]).map(x => [x.id, x]));
  return rows.map(v => {
    const lead = leadMap.get(v.lead_id);
    return { v, lead, person: lead ? personMap.get(lead.person_id) : undefined, property: propMap.get(v.property_id) };
  });
}
