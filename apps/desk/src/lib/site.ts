import { supabase } from './supabase';
import { BUCKET, shrink } from './photos';
import { t } from './i18n';

export type Theme = 'moderne' | 'riad' | 'noir';
export const THEMES: { id: Theme; name: string; text: string; bg: string; surface: string; ink: string; accent: string }[] = [
  { id: 'moderne', name: 'Moderne', text: 'Light and sharp, lots of white space.', bg: '#F3F6FA', surface: '#FFFFFF', ink: '#001E3E', accent: '#00874B' },
  { id: 'riad', name: 'Riad', text: 'Warm sand and terracotta, Moroccan feel.', bg: '#FAF6F0', surface: '#FFFDF9', ink: '#342418', accent: '#B5562F' },
  { id: 'noir', name: 'Noir', text: 'Dark and luxurious, for high-end properties.', bg: '#0C1016', surface: '#161B23', ink: '#ECF0F5', accent: '#B08D57' },
];
export const themeText = (th: typeof THEMES[number]) => t(th.text);

export const COLORS = ['#00874B', '#04419C', '#0F766E', '#B5562F', '#B08D57', '#8B1E3F', '#556B2F', '#1F2937'];

export const BLOCKS = ['hero', 'featured', 'listings', 'projects', 'about', 'team', 'reviews', 'areas', 'map', 'blog', 'estimate', 'contact'] as const;
export type Block = typeof BLOCKS[number];
export const blockLabel = (b: Block) => t(({
  hero: 'Large photo at the top', featured: 'Our favorite (one property in the spotlight)', listings: 'Your properties', projects: 'New-build projects', about: 'About us and services',
  team: 'Your team', reviews: 'Client reviews', areas: 'Neighborhoods', map: 'Map of your neighborhoods', blog: 'Latest articles', estimate: 'How much is my property worth? (estimate)', contact: 'Contact and call-back form',
} as const)[b]);

/** Upload an image of the website (logo, large photo, team photo) and return its path without extension. */
export async function uploadSiteImage(orgId: string, file: File, max = 1800): Promise<string> {
  const base = `${orgId}/site/${crypto.randomUUID()}`;
  const [big, small] = await Promise.all([shrink(file, max, 0.84), shrink(file, 520, 0.8)]);
  const opts = { contentType: 'image/jpeg', cacheControl: '31536000' };
  const a = await supabase.storage.from(BUCKET).upload(`${base}.jpg`, big, opts);
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.storage.from(BUCKET).upload(`${base}_t.jpg`, small, opts);
  if (b.error) { await supabase.storage.from(BUCKET).remove([`${base}.jpg`]); throw new Error(b.error.message); }
  return base;
}
export async function removeSiteImage(base: string | null | undefined) {
  if (base && base.includes('/site/')) await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]);
}
