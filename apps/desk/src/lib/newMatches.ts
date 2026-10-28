import { supabase } from './supabase';
import { MATCH_COLUMNS, matches, type MatchProp } from './matching';
import { OPEN_LEAD_STATUSES } from './labels';
import type { LeadRow, PersonRow } from './types';

/** A lead that still searches, with the properties that recently became available and fit. */
export type NewMatch = { lead: LeadRow; person: PersonRow | undefined; props: MatchProp[] };

/** How far back a property counts as new. */
export const NEW_DAYS = 14;

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/**
 * Properties that were added as available, or became available, in the last NEW_DAYS days, matched against the
 * open leads. Leaves out pairs the team already sent or skipped, and pairs that already have a viewing.
 */
export async function loadNewMatches(orgId: string): Promise<NewMatch[]> {
  const since = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString();
  const h = await supabase.from('property_status_history').select('property_id')
    .eq('org_id', orgId).in('field', ['created', 'status']).eq('new_value', 'available').gte('changed_at', since);
  if (h.error) throw new Error(h.error.message);
  const ids = uniq(((h.data ?? []) as { property_id: string }[]).map(x => x.property_id));
  if (ids.length === 0) return [];

  const [pr, ld] = await Promise.all([
    supabase.from('properties').select(MATCH_COLUMNS).in('id', ids).eq('status', 'available'),
    supabase.from('leads').select('*').eq('org_id', orgId).in('status', OPEN_LEAD_STATUSES),
  ]);
  if (pr.error) throw new Error(pr.error.message);
  if (ld.error) throw new Error(ld.error.message);
  const props = (pr.data ?? []) as MatchProp[];
  const leads = (ld.data ?? []) as LeadRow[];
  if (props.length === 0 || leads.length === 0) return [];

  const groups = leads
    .map(lead => ({ lead, props: props.filter(p => matches(lead, p)) }))
    .filter(g => g.props.length > 0);
  if (groups.length === 0) return [];

  const leadIds = groups.map(g => g.lead.id);
  const [seen, vw, pe] = await Promise.all([
    supabase.from('match_notices').select('lead_id, property_id').in('lead_id', leadIds),
    supabase.from('viewings').select('lead_id, property_id').in('lead_id', leadIds),
    supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', uniq(groups.map(g => g.lead.person_id))),
  ]);
  if (pe.error) throw new Error(pe.error.message);
  if (vw.error) throw new Error(vw.error.message);
  // Without the 6c table the block still works; it just cannot remember what was sent.
  const done = new Set([...(seen.error ? [] : seen.data ?? []), ...(vw.data ?? [])]
    .map(x => `${(x as { lead_id: string }).lead_id}:${(x as { property_id: string }).property_id}`));
  const people = new Map(((pe.data ?? []) as PersonRow[]).map(x => [x.id, x]));

  return groups
    .map(g => ({ lead: g.lead, person: people.get(g.lead.person_id), props: g.props.filter(p => !done.has(`${g.lead.id}:${p.id}`)) }))
    .filter(g => g.props.length > 0)
    .sort((a, b) => b.props.length - a.props.length || b.lead.created_at.localeCompare(a.lead.created_at));
}

/** Remember that these matches were sent or skipped. Returns an error message, or null when it worked. */
export async function markMatches(leadId: string, propertyIds: string[], status: 'sent' | 'dismissed'): Promise<string | null> {
  const { error } = await supabase.rpc('mark_matches', { p_lead: leadId, p_properties: propertyIds, p_status: status });
  return error ? error.message : null;
}
