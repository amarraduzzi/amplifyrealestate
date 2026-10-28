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
const CODES: Record<string, string> = {
  referral_no_consent: 'The client must agree that you pass on their details.',
  referral_invalid: 'Check the name, the phone number and the amounts.',
  referral_closed: 'This referral has already been answered.',
  referral_not_won: 'Mark the referral as won first.',
  collab_not_shared: 'This property is no longer shared with you or no longer available.',
  collab_closed: 'This collaboration is closed.',
  collab_listing_only: 'Only the office of the property can set the price, the commission and the payment.',
  collab_no_commission: 'Fill in the total commission first.',
  network_collabs_open_idx: 'You already proposed this client for this property.',
};
const KNOWN = [
  'No office found with that code.', 'That is your own office.', 'There is already a partnership or an open invitation with this office.',
  'This office is not your partner.', 'Only available properties can be shared.', 'You do not have permission to change this.',
];
export const networkError = (m: string) => {
  const c = Object.keys(CODES).find(x => m.includes(x)); if (c) return t(CODES[c]);
  const k = KNOWN.find(x => m.includes(x)); return k ? t(k) : planError(m);
};

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

export type ReferralStatus = 'sent' | 'accepted' | 'declined' | 'won' | 'lost';
export type Referral = {
  id: string; outgoing: boolean; office: string; office_whatsapp: string | null; client_name: string; client_phone: string | null; purpose: DealPurpose;
  city: string | null; property_types: PropertyType[]; budget_max_cents: number | null; note: string | null; fee_pct: number; status: ReferralStatus;
  commission_cents: number | null; fee_cents: number | null; fee_paid_on: string | null; created_at: string; lead_id: string | null;
};
export type CollabStatus = 'proposed' | 'accepted' | 'visit' | 'offer' | 'signed' | 'paid' | 'declined' | 'cancelled';
export type Collab = {
  id: string; listing: boolean; office: string; office_whatsapp: string | null; office_phone: string | null; reference: string; title: string; city: string | null;
  property_price_cents: number | null; client_name: string | null; partner_share_pct: number; status: CollabStatus; visit_at: string | null; price_cents: number | null;
  commission_cents: number | null; note: string | null; paid_on: string | null; created_at: string; property_id: string | null;
};
export async function loadWork(orgId: string): Promise<{ referrals: Referral[]; collabs: Collab[] } | null> {
  const r = await supabase.rpc('network_work', { p_org: orgId });
  if (r.error) return null;
  const d = (r.data ?? {}) as { referrals?: Referral[]; collabs?: Collab[] };
  return { referrals: d.referrals ?? [], collabs: (d.collabs ?? []).map(c => ({ ...c, partner_share_pct: Number(c.partner_share_pct) })) };
}
export const referralStatusLabel = (s: ReferralStatus) => t(({ sent: 'Waiting for an answer', accepted: 'Accepted', declined: 'Declined', won: 'Won', lost: 'Not concluded' } as const)[s]);
export const collabStatusLabel = (s: CollabStatus) => t(({ proposed: 'Proposed', accepted: 'Accepted', visit: 'Viewing planned', offer: 'Offer made', signed: 'Signed', paid: 'Commission paid', declined: 'Declined', cancelled: 'Cancelled' } as const)[s]);
