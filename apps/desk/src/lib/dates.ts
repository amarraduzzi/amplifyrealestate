import { getLang, t } from './i18n';

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

/** Today as YYYY-MM-DD in local time (the format of a date column and of <input type="date">). */
export const todayStr = () => toInputValue(new Date()).slice(0, 10);

/** Whole days from today until a YYYY-MM-DD date (negative = in the past). */
export function daysUntil(due: string): number {
  const a = new Date(`${due}T00:00:00`), b = new Date(`${todayStr()}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "Overdue by 2 days", "Today", "Tomorrow" or a date. */
export function dueText(due: string): string {
  const d = daysUntil(due);
  if (d < -1) return t('Overdue by {n} days', { n: -d });
  if (d === -1) return t('Overdue by 1 day');
  if (d === 0) return t('Today');
  if (d === 1) return t('Tomorrow');
  return new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(`${due}T00:00:00`));
}
