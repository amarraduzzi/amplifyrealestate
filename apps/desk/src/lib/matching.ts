import type { LeadRow, PropertyRow } from './types';

/** The few property fields needed to match a lead. */
export type MatchProp = Pick<PropertyRow,
  'id' | 'title' | 'reference' | 'purpose' | 'status' | 'price_cents' | 'property_type' | 'city' | 'neighborhood' | 'bedrooms' | 'area_m2' | 'furnished'>;

export const MATCH_COLUMNS = 'id, title, reference, purpose, status, price_cents, property_type, city, neighborhood, bedrooms, area_m2, furnished';

// Compare names without caring about capitals or accents ("Hay Riad" = "hay riad").
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Does an available property fit what the lead is looking for? Every criterion the lead filled in must fit. */
export function matches(l: LeadRow, p: MatchProp): boolean {
  if (p.status !== 'available') return false;
  if (l.purpose !== p.purpose) return false;
  if (l.property_types.length > 0 && !l.property_types.includes(p.property_type)) return false;
  if (l.city && (!p.city || norm(p.city) !== norm(l.city))) return false;
  if (l.neighborhoods.length > 0) {
    const hood = p.neighborhood ? norm(p.neighborhood) : null;
    if (!hood || !l.neighborhoods.some(n => norm(n) === hood)) return false;
  }
  if (l.budget_min_cents !== null || l.budget_max_cents !== null) {
    if (p.price_cents === null) return false;
    if (l.budget_min_cents !== null && p.price_cents < l.budget_min_cents) return false;
    if (l.budget_max_cents !== null && p.price_cents > l.budget_max_cents) return false;
  }
  if (l.min_bedrooms !== null && (p.bedrooms === null || p.bedrooms < l.min_bedrooms)) return false;
  if (l.min_area_m2 !== null && (p.area_m2 === null || Number(p.area_m2) < Number(l.min_area_m2))) return false;
  if (l.furnished !== null && p.furnished !== l.furnished) return false;
  return true;
}
