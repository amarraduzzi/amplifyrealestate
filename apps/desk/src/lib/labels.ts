import type { DealPurpose, PropertyStatus, PropertyType } from '@vastgoed/shared';
import { t } from './i18n';

export const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
export const TYPES: PropertyType[] = ['apartment', 'villa', 'riad', 'house', 'land', 'shop', 'office', 'building', 'other'];
export const STATUSES: PropertyStatus[] = ['available', 'reserved', 'rented', 'sold', 'draft', 'withdrawn'];

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
  t(({
    draft: 'Draft', available: 'Available', reserved: 'Reserved',
    rented: 'Rented', sold: 'Sold', withdrawn: 'Withdrawn',
  } as const)[s]);

export const statusCls: Record<PropertyStatus, string> = {
  available: 'bg-ok/10 text-ok',
  reserved: 'bg-warn/10 text-warn',
  rented: 'bg-qr/10 text-qr',
  sold: 'bg-qr/10 text-qr',
  draft: 'bg-surface-3 text-muted',
  withdrawn: 'bg-danger/10 text-danger',
};

/** Whole days since an ISO date (0 = today). */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d < 0 ? 0 : d;
}
