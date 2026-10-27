// Gedeelde types en hulpfuncties voor Amplify Vastgoed.
// Moeten overeenkomen met de enums in supabase/migrations/20261027000100_core.sql.

export type OrgRole = 'owner' | 'manager' | 'agent' | 'viewer';

export type PropertyType =
  | 'apartment' | 'villa' | 'riad' | 'house' | 'land'
  | 'shop' | 'office' | 'building' | 'other';

// sale = totaalprijs, rent_long = per maand, rent_short = per nacht
export type DealPurpose = 'sale' | 'rent_long' | 'rent_short';

export type PropertyStatus =
  | 'draft' | 'available' | 'reserved' | 'rented' | 'sold' | 'withdrawn';

export type PartyRole = 'owner' | 'representative' | 'tenant' | 'buyer' | 'contact';

export type LeadStatus = 'new' | 'active' | 'viewing' | 'won' | 'lost';

export type ViewingStatus = 'scheduled' | 'done' | 'cancelled' | 'no_show';
export type ViewingOutcome = 'interested' | 'not_interested' | 'offer_made';

export type TaskStatus = 'open' | 'done' | 'cancelled';

export type MandateBasis = 'written' | 'verbal' | 'owner_self' | 'unverified';
export type MandateStatus = 'active' | 'expired' | 'revoked';

/** Bedragen staan overal in centimes (gehele getallen), nooit als kommagetal. */
export function dirhamToCents(dirham: number): number {
  return Math.round(dirham * 100);
}

export function formatMad(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '-';
  const hasDecimals = cents % 100 !== 0;
  return (
    new Intl.NumberFormat('fr-MA', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(cents / 100) + ' DH'
  );
}

export * from './brand';
