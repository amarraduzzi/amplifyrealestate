import { supabase } from './supabase';
import { BUCKET, shrink } from './photos';
import { t } from './i18n';

/** The fixed list of features a property can have. The keys are stored; the public page translates them. */
export const FEATURES = ['gated', 'guard', 'elevator', 'parking', 'pool', 'garden', 'terrace', 'sea_view', 'air_con', 'equipped_kitchen', 'fiber', 'solar'] as const;
export type Feature = typeof FEATURES[number];
export const featureLabel = (f: string) => t(({
  gated: 'Gated residence', guard: 'Guard 24/7', elevator: 'Elevator', parking: 'Parking', pool: 'Pool', garden: 'Garden',
  terrace: 'Terrace', sea_view: 'Sea view', air_con: 'Air conditioning', equipped_kitchen: 'Equipped kitchen', fiber: 'Fiber internet', solar: 'Solar water heater',
} as Record<string, string>)[f] ?? f);

export const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const orientationLabel = (o: string) => t(({ N: 'North', NE: 'North-east', E: 'East', SE: 'South-east', S: 'South', SW: 'South-west', W: 'West', NW: 'North-west' } as Record<string, string>)[o] ?? o);

export const TITLE_STATUSES = ['titre', 'melkia', 'en_cours'] as const;
export type TitleStatus = typeof TITLE_STATUSES[number];
export const titleStatusLabel = (s: string) => t(({ titre: 'Titre foncier', melkia: 'Melkia', en_cours: 'Titre en cours' } as Record<string, string>)[s] ?? s);

export const NEAR = ['near_beach', 'near_transport', 'near_school', 'near_mosque', 'near_shops'] as const;
export type NearKey = typeof NEAR[number];
export const nearLabel = (k: NearKey) => t(({ near_beach: 'Beach', near_transport: 'Tram or train', near_school: 'School', near_mosque: 'Mosque', near_shops: 'Shops' } as const)[k]);

export const LANGS = ['darija', 'fr', 'ar', 'en', 'es', 'nl', 'de', 'tamazight'] as const;
export const langLabel = (l: string) => ({ darija: 'Darija', fr: 'Français', ar: 'العربية', en: 'English', es: 'Español', nl: 'Nederlands', de: 'Deutsch', tamazight: 'Tamazight' } as Record<string, string>)[l] ?? l;

/** Upload the photo of the office contact person (square, 480 px) and return its storage path without extension. */
export async function uploadAgentPhoto(orgId: string, file: File): Promise<string> {
  const base = `${orgId}/agent/${crypto.randomUUID()}`;
  const [big, small] = await Promise.all([shrink(file, 640, 0.84), shrink(file, 240, 0.8)]);
  const opts = { contentType: 'image/jpeg', cacheControl: '31536000' };
  const a = await supabase.storage.from(BUCKET).upload(`${base}.jpg`, big, opts);
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.storage.from(BUCKET).upload(`${base}_t.jpg`, small, opts);
  if (b.error) { await supabase.storage.from(BUCKET).remove([`${base}.jpg`]); throw new Error(b.error.message); }
  return base;
}
export async function removeAgentPhoto(base: string) {
  await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]);
}
