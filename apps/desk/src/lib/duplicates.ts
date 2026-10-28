import { supabase } from './supabase';
import type { PropertyRow } from './types';

export type DupRow = { id: string; reference: string; title: string };
type Probe = Pick<PropertyRow, 'purpose' | 'property_type' | 'city' | 'neighborhood' | 'area_m2' | 'price_cents'> & { id?: string };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const near = (a: number | null, b: number | null, pct: number) => a !== null && b !== null && a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= pct;

/** Properties of the same office that look like the same one: same offer, type and neighborhood, and a similar surface or price. */
export async function findDuplicates(orgId: string, p: Probe): Promise<DupRow[]> {
  if (!norm(p.neighborhood)) return [];
  const r = await supabase.from('properties')
    .select('id, reference, title, city, neighborhood, area_m2, price_cents')
    .eq('org_id', orgId).eq('purpose', p.purpose).eq('property_type', p.property_type).in('status', ['available', 'reserved', 'draft']).limit(300);
  if (r.error || !r.data) return [];
  const area = p.area_m2 === null ? null : Number(p.area_m2);
  return (r.data as { id: string; reference: string; title: string; city: string | null; neighborhood: string | null; area_m2: number | null; price_cents: number | null }[])
    .filter(x => x.id !== p.id && norm(x.neighborhood) === norm(p.neighborhood) && (!norm(p.city) || !norm(x.city) || norm(x.city) === norm(p.city)))
    .filter(x => near(area, x.area_m2 === null ? null : Number(x.area_m2), 0.08) || near(p.price_cents, x.price_cents, 0.08))
    .slice(0, 3).map(x => ({ id: x.id, reference: x.reference, title: x.title }));
}
