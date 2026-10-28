import { supabase } from './supabase';

export type Channel = 'direct' | 'airbnb' | 'booking' | 'other';
export type Stay = {
  id: string; org_id: string; property_id: string; guest_name: string; guest_phone: string | null; channel: Channel;
  check_in: string; check_out: string; guests: number | null; total_cents: number; cleaning_cents: number; channel_fee_cents: number;
  notes: string | null; status: 'confirmed' | 'cancelled';
};
export type StayProp = { id: string; title: string; reference: string; price_cents: number | null; ical_token: string | null };

export const CHANNELS: Channel[] = ['direct', 'airbnb', 'booking', 'other'];
export const channelName = (c: Channel, other: string) => ({ direct: 'Direct', airbnb: 'Airbnb', booking: 'Booking', other } as const)[c];
export const channelCls: Record<Channel, string> = {
  direct: 'bg-brand text-white', airbnb: 'bg-[#e8505b] text-white', booking: 'bg-[#1e4fa0] text-white', other: 'bg-ink/70 text-white',
};

/** Nights between two YYYY-MM-DD dates. */
export const nights = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** Short-term properties of the office, or null when etappe 7e is not installed. */
export async function loadStayProps(orgId: string): Promise<StayProp[] | null> {
  const r = await supabase.from('properties').select('id, title, reference, price_cents, ical_token')
    .eq('org_id', orgId).eq('purpose', 'rent_short').neq('status', 'withdrawn').order('title');
  return r.error ? null : (r.data ?? []) as StayProp[];
}

/** Bookings that touch the period [from, to). */
export async function loadStays(orgId: string, from: string, to: string): Promise<Stay[]> {
  const r = await supabase.from('stays').select('*').eq('org_id', orgId).lt('check_in', to).gt('check_out', from).order('check_in');
  return r.error ? [] : (r.data ?? []) as Stay[];
}

export function stayError(m: string): string | null {
  if (m.includes('stay_overlap')) return 'These dates overlap with another booking of this property.';
  if (m.includes('stay_not_short_term')) return 'Bookings are only for properties for short-term rent.';
  if (m.includes('stays_check') || m.includes('check_out')) return 'The departure must be after the arrival.';
  return null;
}
