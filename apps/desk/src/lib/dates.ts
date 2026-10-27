import { getLang } from './i18n';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** "27 Oct 2026, 10:00" in the language of the app. */
export const whenText = (iso: string) =>
  new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const pad = (n: number) => String(n).padStart(2, '0');

/** Value for an <input type="datetime-local"> in the local time of the browser. */
export function toInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tomorrow at 10:00, a sensible default for a new viewing. */
export function defaultViewingTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toInputValue(d);
}

/** Local datetime-local text -> ISO string for the database, or null when it is not a valid date. */
export function fromInputValue(s: string): string | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
