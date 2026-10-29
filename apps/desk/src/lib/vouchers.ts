import { supabase } from './supabase';
import { t, getLang } from './i18n';
import { friendly } from './errors';
import { PUBLIC_SITE } from './publicSite';

export type Voucher = { id: string; property_id: string; token: string; visitor_name: string; visitor_phone: string; months: number; visited_at: string };

export const voucherUrl = (token: string) => `${PUBLIC_SITE}/v/${token}?lang=${getLang() === 'ar' ? 'ar' : 'fr'}`;

/** Send the copy straight to the visitor's WhatsApp (Moroccan 06/07 numbers become 2126/2127). */
export function voucherWhatsapp(phone: string, token: string, title: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = `212${d.slice(1)}`;
  const text = t('Hello, here is your copy of the visit voucher for “{title}”: {url}', { title, url: voucherUrl(token) });
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export async function loadVouchers(orgId: string, propertyId?: string): Promise<{ rows: Voucher[]; error: string | null }> {
  let q = supabase.from('visit_vouchers').select('id, property_id, token, visitor_name, visitor_phone, months, visited_at').eq('org_id', orgId).order('visited_at', { ascending: false }).limit(200);
  if (propertyId) q = q.eq('property_id', propertyId);
  const { data, error } = await q;
  return { rows: (data ?? []) as Voucher[], error: error ? friendly(error) : null };
}

export function voucherError(message: string): string {
  if (message.includes('telefoon_ongeldig')) return t('Please enter the visitor’s phone number (at least 8 digits).');
  if (message.includes('handtekening_ontbreekt')) return t('The visitor has to sign first.');
  if (message.includes('niet_toegestaan')) return t('You do not have permission to do this.');
  return friendly(message);
}
