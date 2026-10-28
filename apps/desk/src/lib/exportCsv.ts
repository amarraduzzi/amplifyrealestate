import { t } from './i18n';
import { dealStageLabel, leadStatusLabel, purposeLabel, statusLabel, typeLabel } from './labels';
import type { DealView } from './deals';
import type { LeaseView } from './leases';
import { leaseStatusLabel } from './labels';
import { isOverdue, type PaymentRow } from './payments';
import { ourShareCents, sharedPct } from './splits';
import type { LeadRow, PersonRow, PropertyRow } from './types';

/** A phone number: written so that Excel keeps the leading 0 (only digits, + and spaces are let through). */
type Phone = { phone: string };
type Cell = string | number | null | undefined | Phone;
const phone = (s: string | null | undefined): Phone => ({ phone: (s ?? '').replace(/[^0-9+ ]/g, '') });

const cell = (v: Cell) => {
  if (v !== null && typeof v === 'object') return v.phone ? `"=""${v.phone}"""` : '';
  const s = v === null || v === undefined ? '' : String(v);
  // A leading = + - @ is made harmless so Excel never runs the text as a formula.
  const safe = /^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s))) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const money = (cents: number | null) => (cents === null ? '' : String(cents / 100).replace('.', ','));
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** CSV text: separator ; and a byte order mark, so Excel (FR/AR/EN) opens it with the right columns and accents. */
export function toCsv(head: string[], lines: Cell[][]): string {
  return '\uFEFF' + [head, ...lines].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function dealsCsv(rows: DealView[]): string {
  return toCsv(
    [t('Date'), t('Reference'), t('Property'), t('Client'), t('Stage'), t('Price'), t('Commission %'), t('Commission'), t('Signed on'), t('Paid on'), t('Notes'), t('Shared %'), t('Your share')],
    rows.map(({ d, person, property, splits }) => [
      day(d.stage_changed_at), property?.reference, property?.title, person?.full_name, dealStageLabel(d.stage),
      money(d.price_cents), d.commission_pct === null ? '' : String(d.commission_pct).replace('.', ','), money(d.commission_cents),
      day(d.signed_at), day(d.paid_at), d.notes,
      splits.length === 0 ? '' : String(sharedPct(splits)).replace('.', ','), splits.length === 0 ? '' : money(ourShareCents(d, splits)),
    ]));
}

export function propertiesCsv(rows: PropertyRow[]): string {
  return toCsv(
    [t('Reference'), t('Title'), t('Type'), t('Purpose'), t('Status'), t('Price'), t('City'), t('Neighborhood'), t('Bedrooms'), t('Bathrooms'), t('Area (m²)'), t('Furnished'), t('Public page'), t('Confirmed on')],
    rows.map(r => [
      r.reference, r.title, typeLabel(r.property_type), purposeLabel(r.purpose), statusLabel(r.status), money(r.price_cents),
      r.city, r.neighborhood, r.bedrooms, r.bathrooms, r.area_m2 === null ? '' : String(r.area_m2).replace('.', ','),
      r.furnished === null ? '' : r.furnished ? t('Furnished') : t('Unfurnished'), r.is_published ? t('Online') : t('Offline'), day(r.info_confirmed_at),
    ]));
}

export function leadsCsv(rows: LeadRow[], people: Record<string, PersonRow>): string {
  return toCsv(
    [t('Name'), t('Phone'), t('WhatsApp'), t('Email'), t('Status'), t('Purpose'), t('City'), t('Neighborhoods'), t('Budget min'), t('Budget max'), t('Last contact'), t('Notes')],
    rows.map(l => {
      const p = people[l.person_id];
      return [p?.full_name, phone(p?.phone), phone(p?.whatsapp), p?.email, leadStatusLabel(l.status), purposeLabel(l.purpose), l.city,
        l.neighborhoods.join(', '), money(l.budget_min_cents), money(l.budget_max_cents), day(l.last_contact_at), l.notes];
    }));
}

/** The leases with what is overdue per lease (unpaid and past the due date). */
export function leasesCsv(rows: LeaseView[], open: PaymentRow[]): string {
  const late = new Map<string, { n: number; cents: number }>();
  for (const p of open) if (isOverdue(p)) { const x = late.get(p.lease_id) ?? { n: 0, cents: 0 }; x.n++; x.cents += p.amount_cents; late.set(p.lease_id, x); }
  return toCsv(
    [t('Reference'), t('Property'), t('Tenant'), t('Phone'), t('Status'), t('Rent'), t('Deposit'), t('Rent is due on day'), t('Start date'), t('End date'), t('Overdue months'), t('Overdue amount'), t('Notes')],
    rows.map(({ l, person, property }) => [
      property?.reference, property?.title, person?.full_name, phone(person?.whatsapp || person?.phone), leaseStatusLabel(l.status),
      money(l.rent_cents), money(l.deposit_cents), l.payment_day, day(l.start_date), day(l.end_date),
      late.get(l.id)?.n ?? 0, money(late.get(l.id)?.cents ?? 0), l.notes,
    ]));
}

export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
