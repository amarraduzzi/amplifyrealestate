import { getLang, LOCALE, t } from './i18n';
import type { NearKey } from './api';

/**
 * Indicative euro rate for MRE buyers. Bank Al-Maghrib, October 2026: about 10.9 to 11.0 DH for 1 euro.
 * Update this one number now and then; the page always says "≈" and "indicative".
 */
export const EUR_MAD = 10.9;

/** Purchase costs in Morocco (old or new home, 2026): registration 4%, land registry 1.5%, notary about 1.2%, stamps about 0.15%. */
export const FEES = [
  { key: 'Registration duties', pct: 4 },
  { key: 'Land registry (ANCFCC)', pct: 1.5 },
  { key: 'Notary, about', pct: 1.2 },
  { key: 'Stamps and admin, about', pct: 0.15 },
] as const;
export const FEES_PCT = FEES.reduce((a, f) => a + f.pct, 0);

/** State housing aid 2024 to 2028: 100 000 DH up to 300 000 DH, 70 000 DH up to 700 000 DH (first purchase of a new home). */
export function housingAid(priceCents: number | null): number | null {
  if (priceCents === null || priceCents <= 0) return null;
  if (priceCents <= 300_000_00) return 100_000_00;
  if (priceCents <= 700_000_00) return 70_000_00;
  return null;
}

/** Monthly payment of a loan (annuity). */
export function monthly(loanCents: number, ratePct: number, years: number): number {
  const n = years * 12, r = ratePct / 100 / 12;
  if (loanCents <= 0) return 0;
  if (r === 0) return loanCents / n;
  return (loanCents * r) / (1 - Math.pow(1 + r, -n));
}

export const formatEur = (cents: number) =>
  new Intl.NumberFormat(LOCALE[getLang()], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(cents / 100 / EUR_MAD / 1000) * 1000);

export const featureLabel = (f: string) => t(({
  gated: 'Gated residence', guard: 'Guard 24/7', elevator: 'Elevator', parking: 'Parking', pool: 'Pool', garden: 'Garden',
  terrace: 'Terrace', sea_view: 'Sea view', air_con: 'Air conditioning', equipped_kitchen: 'Equipped kitchen', fiber: 'Fiber internet', solar: 'Solar water heater',
} as Record<string, string>)[f] ?? f);

export const orientationLabel = (o: string) => t(({ N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' } as Record<string, string>)[o] ?? o);

export const titleStatusLabel = (s: string) => t(({ titre: 'Titre foncier', melkia: 'Melkia', en_cours: 'Titre en cours' } as Record<string, string>)[s] ?? s);

export const NEAR_ORDER: NearKey[] = ['beach', 'transport', 'school', 'mosque', 'shops'];
export const nearLabel = (k: NearKey) => t(({ beach: 'Beach', transport: 'Tram or train', school: 'School', mosque: 'Mosque', shops: 'Shops' } as const)[k]);

export const langLabel = (l: string) => ({ darija: 'Darija', fr: 'Français', ar: 'العربية', en: 'English', es: 'Español', nl: 'Nederlands', de: 'Deutsch', tamazight: 'Tamazight' } as Record<string, string>)[l] ?? l;
