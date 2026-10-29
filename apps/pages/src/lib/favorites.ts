import { useEffect, useState } from 'react';
import { getLang } from './i18n';
import { officePath } from './router';

// Favorites live in this browser only, per office: no account needed. Storage can be missing or full, so every access is guarded.
const key = (slug: string) => `amplify:favs:${slug}`;
const EVENT = 'pages:favs';
const REF = /^[A-Za-z0-9-]{2,40}$/;

export function readFavs(slug: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key(slug)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && REF.test(x)).slice(0, 60) : [];
  } catch { return []; }
}

function write(slug: string, list: string[]) {
  try { window.localStorage.setItem(key(slug), JSON.stringify(list)); } catch { /* storage not available: keep it for this visit only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { slug, list } }));
}

export function toggleFav(slug: string, reference: string) {
  const now = readFavs(slug);
  write(slug, now.includes(reference) ? now.filter(r => r !== reference) : [reference, ...now]);
}

/** The favorites of this office, kept in sync between the cards, the property page and the header. */
export function useFavs(slug: string): string[] {
  const [list, setList] = useState<string[]>(() => readFavs(slug));
  useEffect(() => {
    setList(readFavs(slug));
    const on = (e: Event) => { const d = (e as CustomEvent<{ slug: string; list: string[] }>).detail; if (d.slug === slug) setList(d.list); };
    const storage = (e: StorageEvent) => { if (e.key === key(slug)) setList(readFavs(slug)); };
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', storage); };
  }, [slug]);
  return list;
}

/** A link to the office page that opens with exactly these properties: for the family or a partner. */
export const selectionUrl = (slug: string, refs: string[]) =>
  `${window.location.origin}${officePath(slug)}?lang=${getLang()}&selection=${refs.map(encodeURIComponent).join(',')}`;

/** The selection someone shared, read from the address. */
export function sharedSelection(): string[] | null {
  const raw = new URLSearchParams(window.location.search).get('selection');
  if (!raw) return null;
  const refs = raw.split(',').map(s => s.trim()).filter(s => REF.test(s)).slice(0, 60);
  return refs.length > 0 ? refs : null;
}
