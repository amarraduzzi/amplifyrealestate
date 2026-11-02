// Languages: English first. French and Arabic (right to left) are ready to be filled in:
// add the translations to lib/i18n/fr.ts and lib/i18n/ar.ts (English text -> translation).
// The English text is the key: t('Save') returns the translation when one exists, otherwise the
// English text itself, so a missing translation shows English, never a blank.
// Variables: t('{n} days ago', { n: 3 }).

import { FR } from './i18n/fr';
import { AR } from './i18n/ar';
import { AR2, FR2 } from './i18n/stays2';
import { AR3, FR3 } from './i18n/booking';
import { AR4, FR4 } from './i18n/showcase';
import { AR5, FR5 } from './i18n/agent';
import { AR6, FR6 } from './i18n/quick';

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

const ONE: Record<string, Record<string, string>> = {
  en: { '{n} items': '{n} item', '{n} invoices': '{n} invoice', '{n} new properties': '{n} new property', '{n} unpaid months': '{n} unpaid month', '{n} days ago': '{n} day ago' },
  fr: { '{n} items': '{n} élément', '{n} invoices': '{n} facture', '{n} new properties': '{n} nouveau bien', '{n} unpaid months': '{n} mois impayé', '{n} days ago': 'Il y a {n} jour', '{n} open': '{n} ouverte', '{n} days left, until {date}.': '{n} jour restant, jusqu’au {date}.', '{n} past due date': '{n} échue' },
};

export function t(en: string, vars?: Record<string, string | number>): string {
  const dict = current === 'ar' ? AR : current === 'fr' ? FR : null;
  const extra = current === 'ar' ? AR2 : current === 'fr' ? FR2 : null;
  const more = current === 'ar' ? AR3 : current === 'fr' ? FR3 : null;
  const vitrine = current === 'ar' ? AR4 : current === 'fr' ? FR4 : null;
  const agent = current === 'ar' ? AR5 : current === 'fr' ? FR5 : null;
  const quick = current === 'ar' ? AR6 : current === 'fr' ? FR6 : null;
  // singular: a count of exactly 1 uses the "<key>|one" entry when there is one ("1 élément", not "1 éléments")
  if (vars && Number(vars.n) === 1) {
    const one = ONE[current]?.[en] ?? (current === 'ar' || current === 'fr' ? undefined : ONE.en[en]);
    if (one) return one.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  }
  let s = dict ? (dict[en] ?? extra?.[en] ?? more?.[en] ?? vitrine?.[en] ?? agent?.[en] ?? quick?.[en] ?? en) : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
  return s;
}
