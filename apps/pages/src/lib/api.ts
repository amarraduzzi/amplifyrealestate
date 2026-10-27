import type { DealPurpose, PropertyStatus, PropertyType } from '@vastgoed/shared';

// The public pages read through two database functions (public_office_page, public_property_page).
// Visitors have no access to any table. Only the public anon key is used here.

export type PublicOffice = { name: string; slug: string; city: string | null; whatsapp: string | null; phone: string | null; email: string | null };

export type PublicCard = {
  reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; status: PropertyStatus;
  price_cents: number | null; currency: string; city: string | null; neighborhood: string | null;
  bedrooms: number | null; bathrooms: number | null; area_m2: number | null;
};
export type PublicProperty = PublicCard & { furnished: boolean | null; description: string | null; info_confirmed_at: string | null; published_at: string | null };

export type OfficePage = { office: PublicOffice; listings: PublicCard[] };
export type PropertyPage = { office: PublicOffice; property: PublicProperty };

const BASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

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
