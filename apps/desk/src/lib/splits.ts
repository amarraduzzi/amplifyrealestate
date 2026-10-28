import { formatMad } from '@vastgoed/shared';
import { supabase } from './supabase';
import { t } from './i18n';
import { planError } from './plan';
import type { DealRow, SplitRow } from './types';
import type { ShareLang } from './publicSite';

/** Centimes that belong to a share: commission × percentage (null while the deal has no commission amount yet). */
export const splitAmount = (commission: number | null, pct: number): number | null =>
  commission === null ? null : Math.round((commission * pct) / 100);

/** What a share is worth: the amount really paid once it is paid, otherwise commission × percentage. */
export const splitCents = (s: SplitRow, commission: number | null): number | null =>
  s.status === 'paid' && s.paid_cents !== null ? s.paid_cents : splitAmount(commission, Number(s.share_pct));

export const sharedPct = (splits: SplitRow[]) => splits.reduce((n, s) => n + Number(s.share_pct), 0);

/** What stays with the office after the shares for other agents (null while there is no commission amount). */
export function ourShareCents(d: DealRow, splits: SplitRow[]): number | null {
  if (d.commission_cents === null) return null;
  const given = splits.reduce((n, s) => n + (splitCents(s, d.commission_cents) ?? 0), 0);
  return Math.max(0, d.commission_cents - given);
}

/** Splits of a set of deals. A missing table (the SQL of etappe 4b not run yet) simply gives no splits. */
export async function loadSplitsFor(dealIds: string[]): Promise<SplitRow[]> {
  if (dealIds.length === 0) return [];
  const r = await supabase.from('deal_splits').select('*').in('deal_id', dealIds).order('created_at');
  return r.error ? [] : ((r.data ?? []) as SplitRow[]);
}

/** Text for an error from the database about a split. */
export function splitError(message: string): string {
  if (message.includes('verdeling_boven_100')) return t('The shares add up to more than 100%.');
  if (message.includes('geen_commissiebedrag')) return t('Fill in the commission amount of the deal first (Edit), then mark the share as paid.');
  if (message.includes('deal_splits_deal_id_person_id_key')) return t('This person already has a share in this deal.');
  return planError(message);
}

// The other agent gets the confirmation in their own language, which can differ from the app language.
const W = {
  fr: {
    amount: (n: string, p: string, pct: string, a: string) => `Bonjour ${n}, pour confirmer notre accord sur « ${p} » : si l’opération aboutit, ${pct} % de la commission de notre agence (soit ${a}) vous revient. Merci de me le confirmer en répondant à ce message.`,
    plain: (n: string, p: string, pct: string) => `Bonjour ${n}, pour confirmer notre accord sur « ${p} » : si l’opération aboutit, ${pct} % de la commission de notre agence vous revient. Merci de me le confirmer en répondant à ce message.`,
  },
  ar: {
    amount: (n: string, p: string, pct: string, a: string) => `مرحبا ${n}، لتأكيد اتفاقنا بخصوص «${p}»: في حال إتمام العملية، يعود إليك ${pct}% من عمولة وكالتنا (أي ${a}). المرجو تأكيد ذلك بالرد على هذه الرسالة.`,
    plain: (n: string, p: string, pct: string) => `مرحبا ${n}، لتأكيد اتفاقنا بخصوص «${p}»: في حال إتمام العملية، يعود إليك ${pct}% من عمولة وكالتنا. المرجو تأكيد ذلك بالرد على هذه الرسالة.`,
  },
  en: {
    amount: (n: string, p: string, pct: string, a: string) => `Hello ${n}, to confirm our agreement on "${p}": if the deal goes through, ${pct}% of our agency's commission (that is ${a}) goes to you. Please confirm by replying to this message.`,
    plain: (n: string, p: string, pct: string) => `Hello ${n}, to confirm our agreement on "${p}": if the deal goes through, ${pct}% of our agency's commission goes to you. Please confirm by replying to this message.`,
  },
};

/** WhatsApp text that puts the agreed share in writing for the other agent. */
export function splitMessage(o: { lang: ShareLang; name: string; property: string; pct: number; cents: number | null; office: string }): string {
  const w = W[o.lang];
  const pct = String(o.pct).replace(/\.0+$/, '');
  const body = o.cents === null ? w.plain(o.name, o.property, pct) : w.amount(o.name, o.property, pct, formatMad(o.cents));
  return `${body}\n— ${o.office}`;
}
