// Languages: English first. French and Arabic (right to left) are ready to be filled in:
// add the translations to lib/i18n/fr.ts and lib/i18n/ar.ts (English text -> translation).
// The English text is the key: t('Save') returns the translation when one exists, otherwise the
// English text itself, so a missing translation shows English, never a blank.
// Variables: t('{n} days ago', { n: 3 }).

import { FR } from './i18n/fr';
import { AR } from './i18n/ar';

export type Lang = 'en' | 'fr' | 'ar';
const isLang = (x: unknown): x is Lang => x === 'en' || x === 'fr' || x === 'ar';
const KEY = 'desk-lang';
let current: Lang = 'en';

export const getLang = () => current;

export function applyLang(l: Lang) {
  current = l;
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'ar' ? 'rtl' : 'ltr';
}

export function readLang(): Lang {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (isLang(q)) { saveLang(q); return q; }
  try { const s = localStorage.getItem(KEY); return isLang(s) ? s : 'en'; } catch { return 'en'; }
}
export function saveLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode: keep it for this session only */ }
}

export function t(en: string, vars?: Record<string, string | number>): string {
  const dict = current === 'ar' ? AR : current === 'fr' ? FR : null;
  let s = dict ? (dict[en] ?? en) : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  return s;
}
