import { t } from './i18n';
import type { PropertyRow } from './types';
import { isBlurry, isDark, isPortrait, type ImageStats } from './photoTools';

export type QualityItem = { key: string; ok: boolean; points: number; tip: string };
export type Quality = { score: number; level: 'good' | 'ok' | 'weak'; items: QualityItem[] };

const LIVING = ['apartment', 'villa', 'riad', 'house'];

/** How good is the ad of a property? 0 to 100, with what is missing and why it matters. `stats` are the analysed photos (cover first); null while unknown. */
export function adQuality(p: PropertyRow, photoCount: number, stats: ImageStats[] | null): Quality {
  const living = LIVING.includes(p.property_type);
  const rent = p.purpose !== 'sale';
  const len = (p.description ?? '').trim().length;
  const cover = stats?.[0];
  const bad = stats ? stats.filter(s => isDark(s) || isBlurry(s)).length : 0;
  const items: QualityItem[] = [
    { key: 'price', points: 14, ok: p.price_cents !== null && p.price_cents > 0, tip: t('Add the price. Ads without a price are skipped by most people.') },
    { key: 'photos5', points: 12, ok: photoCount >= 5, tip: t('Add photos: at least 5 (now {n}).', { n: photoCount }) },
    { key: 'photos8', points: 6, ok: photoCount >= 8, tip: t('Aim for 8 photos or more: living room, kitchen, bedrooms, bathroom, view.') },
    { key: 'place', points: 12, ok: !!p.city?.trim() && !!p.neighborhood?.trim(), tip: t('Fill in the city and the neighborhood: people search by area.') },
    { key: 'area', points: 8, ok: !!p.area_m2 && Number(p.area_m2) > 0, tip: t('Add the surface in m².') },
    { key: 'rooms', points: 6, ok: !living || (p.bedrooms ?? 0) > 0, tip: t('Add the number of bedrooms.') },
    { key: 'baths', points: 2, ok: !living || (p.bathrooms ?? 0) > 0, tip: t('Add the number of bathrooms.') },
    { key: 'desc', points: 10, ok: len >= 80, tip: t('Write a short description (at least 80 characters): floor, light, what is included, nearby.') },
    { key: 'desc2', points: 4, ok: len >= 200, tip: t('A longer description (200 characters or more) gets more calls.') },
    { key: 'furnished', points: 2, ok: !(rent && living) || p.furnished !== null, tip: t('Say whether it is furnished.') },
    { key: 'cover', points: 8, ok: photoCount === 0 || !cover || (!isPortrait(cover) && !isDark(cover)), tip: t('The cover photo is dark or upright. Choose a bright, landscape photo as the cover.') },
    { key: 'photoq', points: 8, ok: bad <= 1, tip: t('{n} photos are dark or blurry. Replace them or let the app brighten them.', { n: bad }) },
    { key: 'online', points: 8, ok: p.is_published, tip: t('Put the public page online so every ad has a link and a contact form.') },
  ];
  const score = items.reduce((a, i) => a + (i.ok ? i.points : 0), 0);
  return { score, level: score >= 80 ? 'good' : score >= 55 ? 'ok' : 'weak', items };
}

/** The missing items, most valuable first. */
export const missing = (q: Quality) => q.items.filter(i => !i.ok).sort((a, b) => b.points - a.points);
