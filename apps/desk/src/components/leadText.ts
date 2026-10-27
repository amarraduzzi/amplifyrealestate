import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { LeadRow } from '../lib/types';
import { priceSuffix, typeLabel } from '../lib/labels';

export function budgetText(l: LeadRow): string {
  const suffix = priceSuffix(l.purpose);
  const sfx = suffix ? ` ${suffix}` : '';
  const min = l.budget_min_cents, max = l.budget_max_cents;
  if (min !== null && max !== null) return `${formatMad(min)} – ${formatMad(max)}${sfx}`;
  if (max !== null) return t('up to {amount}', { amount: formatMad(max) }) + sfx;
  if (min !== null) return t('from {amount}', { amount: formatMad(min) }) + sfx;
  return t('Any budget');
}

/** One line with what the lead is looking for, e.g. "Apartment, House · Agdal, Hay Riad · 2+ bedrooms". */
export function criteriaText(l: LeadRow): string {
  const parts: string[] = [];
  parts.push(l.property_types.length > 0 ? l.property_types.map(typeLabel).join(', ') : t('Any type'));
  const where = [l.neighborhoods.join(', '), l.city].filter(Boolean).join(', ');
  if (where) parts.push(where);
  if (l.min_bedrooms !== null) parts.push(t('{n}+ bedrooms', { n: l.min_bedrooms }));
  if (l.min_area_m2 !== null) parts.push(t('{n}+ m²', { n: Number(l.min_area_m2) }));
  if (l.furnished !== null) parts.push(l.furnished ? t('Furnished') : t('Unfurnished'));
  return parts.join(' · ');
}
