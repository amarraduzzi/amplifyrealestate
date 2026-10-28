import type { DealPurpose, PropertyStatus, PropertyType } from '@vastgoed/shared';

// The public pages read through two database functions (public_office_page, public_property_page).
// Visitors have no access to any table. Only the public anon key is used here.

export type PublicOffice = { name: string; slug: string; city: string | null; whatsapp: string | null; phone: string | null; email: string | null; domain?: string | null };

export type PublicCard = {
  reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; status: PropertyStatus;
  price_cents: number | null; currency: string; city: string | null; neighborhood: string | null;
  bedrooms: number | null; bathrooms: number | null; area_m2: number | null;
  cover?: string | null;
};
export type PublicProperty = PublicCard & { furnished: boolean | null; description: string | null; info_confirmed_at: string | null; published_at: string | null; photos?: string[] };

export type OfficeSite = { tagline: string | null; about: string | null; services: string | null; areas: string | null; done: number };
export type OfficePage = { office: PublicOffice; site?: OfficeSite; listings: PublicCard[] };
export type PropertyPage = { office: PublicOffice; property: PublicProperty };

const BASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** Public address of a photo. `base` comes from the database; the small version ends in _t. */
export const photoUrl = (base: string, small = false) => `${BASE}/storage/v1/object/public/property-photos/${base}${small ? '_t' : ''}.jpg`;

export const apiConfigured = Boolean(BASE && KEY);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function rpc<T>(fn: string, body: Record<string, string>): Promise<T | null> {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T | null;
}

/** null = this page does not exist (or is not online). An error is thrown when the server cannot be reached. */
export async function loadOffice(slug: string): Promise<OfficePage | null> {
  if (!SLUG.test(slug)) return null;
  return rpc<OfficePage>('public_office_page', { p_slug: slug });
}

export async function loadProperty(slug: string, reference: string): Promise<PropertyPage | null> {
  if (!SLUG.test(slug) || reference.length > 40) return null;
  return rpc<PropertyPage>('public_property_page', { p_slug: slug, p_reference: reference });
}

/** Count a visit or a click (no personal data). Never blocks or breaks the page. Visits count once per session. */
export function logEvent(slug: string, reference: string | null, kind: 'view' | 'whatsapp' | 'call'): void {
  if (!apiConfigured || !SLUG.test(slug)) return;
  const key = `ev:${kind}:${slug}:${reference ?? ''}`;
  if (kind === 'view') {
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  }
  try {
    fetch(`${BASE}/rest/v1/rpc/log_page_event`, {
      method: 'POST', keepalive: true,
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_reference: reference ?? '', p_kind: kind }),
    }).catch(() => { /* the page works without it */ });
  } catch { /* ignore */ }
}

export type InquiryResult = 'ok' | 'invalid' | 'busy' | 'error';

/** Leave name, number and a message for the office. The database makes the lead and a call-back task. */
export async function submitInquiry(o: { slug: string; reference: string | null; name: string; phone: string; message: string; purpose?: string; trap: string }): Promise<InquiryResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_inquiry`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: o.slug, p_reference: o.reference ?? '', p_name: o.name, p_phone: o.phone, p_message: o.message, p_purpose: o.purpose ?? null, p_trap: o.trap }),
    });
    if (r.ok) return 'ok';
    const text = await r.text();
    if (text.includes('inquiry_invalid')) return 'invalid';
    if (text.includes('inquiry_busy')) return 'busy';
    return 'error';
  } catch { return 'error'; }
}

/** Hosts that are never an office domain: the Amplify address itself, previews and local testing. */
const PLATFORM = /(^localhost$)|(^127\.)|(\.pages\.dev$)|(\.workers\.dev$)/;

/** On an office's own domain: its office code. Null on the normal Amplify address (or when it cannot be checked). */
export async function resolveDomain(host: string): Promise<string | null> {
  if (!apiConfigured || PLATFORM.test(host)) return null;
  try { return await rpc<string>('public_office_by_domain', { p_host: host }); } catch { return null; }
}

export type PortalPayment = { due_date: string; amount_cents: number; status: 'due' | 'paid'; paid_on: string | null };
export type PortalRepair = { title: string; status: 'open' | 'in_progress' | 'done'; reported_on: string; done_on: string | null; cost_cents: number | null; cost_borne_by: 'owner' | 'tenant' | 'agency' | null };
export type PortalProperty = {
  reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; status: PropertyStatus; price_cents: number | null;
  city: string | null; neighborhood: string | null; cover: string | null;
  online: boolean; mandate_until: string | null; viewings_done: number; viewings_planned: number; interested: number; offers: number;
  page_views: number; contacts: number; sites: string[];
  lease: { tenant: string; rent_cents: number; start_date: string; end_date: string | null; payments: PortalPayment[] } | null;
  repairs: PortalRepair[];
};
export type OwnerPortalData = { owner: { name: string }; lang: string; office: PublicOffice; properties: PortalProperty[]; generated_at: string };

/** The owner portal behind a personal link. null = the link is not valid (anymore). */
export async function loadOwnerPortal(token: string): Promise<OwnerPortalData | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<OwnerPortalData>('public_owner_portal', { p_token: token });
}
