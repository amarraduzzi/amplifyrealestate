// Appearance: light (the default), dark, or automatic (follows the phone).
export type Theme = 'light' | 'dark' | 'auto';
const KEY = 'desk-theme';
const isTheme = (x: unknown): x is Theme => x === 'light' || x === 'dark' || x === 'auto';

export function readTheme(): Theme {
  try { const s = localStorage.getItem(KEY); return isTheme(s) ? s : 'light'; } catch { return 'light'; }
}

let stopAuto: (() => void) | null = null;

/** Sets the colors now. In automatic mode it keeps following the phone until another theme is applied. */
export function applyTheme(theme: Theme) {
  stopAuto?.(); stopAuto = null;
  const root = document.documentElement;
  const set = (dark: boolean) => { root.dataset.theme = dark ? 'dark' : 'light'; };
  if (theme === 'auto' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => set(mq.matches);
    on();
    mq.addEventListener('change', on);
    stopAuto = () => mq.removeEventListener('change', on);
  } else set(theme === 'dark');
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: it lasts for this visit only */ }
  applyTheme(theme);
}
