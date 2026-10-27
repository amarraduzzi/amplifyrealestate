import { t } from './i18n';
import { dealStageLabel } from './labels';
import type { DealView } from './deals';

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote when needed; a leading = + - @ is made harmless so Excel never runs it as a formula.
  const safe = /^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s))) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const money = (cents: number | null) => (cents === null ? '' : String(cents / 100).replace('.', ','));
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** The deals as CSV text: separator ; and a byte order mark, so Excel (FR/AR/EN) opens it with the right columns and accents. */
export function dealsCsv(rows: DealView[]): string {
  const head = [t('Date'), t('Reference'), t('Property'), t('Client'), t('Stage'), t('Price'), t('Commission %'), t('Commission'), t('Signed on'), t('Paid on'), t('Notes')];
  const lines = rows.map(({ d, person, property }) => [
    day(d.stage_changed_at), property?.reference, property?.title, person?.full_name, dealStageLabel(d.stage),
    money(d.price_cents), d.commission_pct === null ? '' : String(d.commission_pct).replace('.', ','), money(d.commission_cents),
    day(d.signed_at), day(d.paid_at), d.notes,
  ]);
  return '\uFEFF' + [head, ...lines].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
