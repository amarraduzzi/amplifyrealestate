import type { DealPurpose, PropertyStatus, PropertyType } from '@vastgoed/shared';
import { t } from './i18n';

export const purposeLabel = (p: DealPurpose) =>
  t(({ sale: 'For sale', rent_long: 'Long-term rent', rent_short: 'Short-term rent' } as const)[p]);

export const priceSuffix = (p: DealPurpose) =>
  p === 'rent_long' ? t('/ month') : p === 'rent_short' ? t('/ night') : '';

export const typeLabel = (x: PropertyType) =>
  t(({
    apartment: 'Apartment', villa: 'Villa', riad: 'Riad', house: 'House', land: 'Land',
    shop: 'Shop', office: 'Office', building: 'Building', other: 'Other',
  } as const)[x]);

export const statusLabel = (s: PropertyStatus) =>
  s === 'reserved' ? t('Reserved') : s === 'rented' ? t('Rented') : s === 'sold' ? t('Sold') : t('Available');

export const statusCls = (s: PropertyStatus) =>
  s === 'available' ? 'bg-ok/10 text-ok' : s === 'reserved' ? 'bg-warn/10 text-warn' : 'bg-surface-3 text-muted';

/** "Confirmed 3 days ago", in the language of the visitor. */
export function confirmedText(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? t('Confirmed today') : d === 1 ? t('Confirmed yesterday') : t('Confirmed {n} days ago', { n: d });
}

export const placeText = (c: { neighborhood: string | null; city: string | null }) =>
  [c.neighborhood, c.city].filter(Boolean).join(', ');
