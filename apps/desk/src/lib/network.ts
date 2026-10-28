import { supabase } from './supabase';
import { t } from './i18n';
import { planError } from './plan';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';

export type Partner = { id: string; status: 'pending' | 'accepted'; incoming: boolean; org_id: string; name: string; city: string | null; slug: string };
export type NetProperty = {
  share_id: string; office: string; whatsapp: string | null; phone: string | null; reference: string; title: string;
  property_type: PropertyType; purpose: DealPurpose; price_cents: number | null; city: string | null; neighborhood: string | null;
  bedrooms: number | null; bathrooms: number | null; area_m2: number | null; furnished: boolean | null; description: string | null;
  commission_pct: number | null; note: string | null; shared_at: string;
};
export type ShareRow = { id: string; property_id: string; partner_org: string; commission_pct: number | null; note: string | null };

/** The messages the database sends back, in the language of the app. */
const KNOWN = [
  'No office found with that code.', 'That is your own office.', 'There is already a partnership or an open invitation with this office.',
  'This office is not your partner.', 'Only available properties can be shared.', 'You do not have permission to change this.',
];
export const networkError = (m: string) => { const k = KNOWN.find(x => m.includes(x)); return k ? t(k) : planError(m); };

export async function loadNetwork(orgId: string): Promise<{ partners: Partner[]; properties: NetProperty[] }> {
  const r = await supabase.rpc('network_overview', { p_org: orgId });
  if (r.error) throw new Error(r.error.message);
  const d = (r.data ?? {}) as { partners?: Partner[]; properties?: NetProperty[] };
  return { partners: d.partners ?? [], properties: d.properties ?? [] };
}

/** Run one of the network functions; returns an error text for the screen, or null when it worked. */
export async function networkCall(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const r = await supabase.rpc(fn, args);
  return r.error ? networkError(r.error.message) : null;
}

export async function loadShares(propertyId: string): Promise<ShareRow[]> {
  const r = await supabase.from('property_shares').select('id, property_id, partner_org, commission_pct, note').eq('property_id', propertyId);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as ShareRow[];
}
