import { useCallback, useEffect, useState } from 'react';
import { Check, History, MessageCircle, Undo2 } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { dateText, daysTo } from '../lib/leases';
import { planError } from '../lib/plan';
import type { Office, PersonRow } from '../lib/types';
import { SHARE_LANGS, type ShareLang } from '../lib/publicSite';
import { ensureRentDue, isOverdue, loadPayments, reminderMessage, todayIso, type PaymentRow } from '../lib/payments';
import { waLink } from './ContactLinks';
import { Btn } from './ui';
import { friendly } from '../lib/errors';

const SHOWN = 6;

/** The monthly rent of one lease: what is due, what is paid, and a WhatsApp reminder for the tenant. */
export function RentPayments({ office, leaseId, startDate, person, propertyTitle, active, onChanged }: {
  office: Office; leaseId: string; startDate: string; person: PersonRow | undefined; propertyTitle: string; active: boolean; onChanged: () => void;
}) {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [all, setAll] = useState(false);
  const [lang, setLang] = useState<ShareLang>('fr');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';
  const [back, setBack] = useState(false);
  const [from, setFrom] = useState(startDate);
  const [paid, setPaid] = useState(true);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await loadPayments(leaseId)); }
    catch (e) { setError(friendly(e)); setRows([]); }
  }, [leaseId]);

  useEffect(() => {
    let live = true;
    (async () => { if (active) await ensureRentDue(office.id); if (live) await load(); })();
    return () => { live = false; };
  }, [office.id, active, load]);

  const update = async (p: PaymentRow, patch: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(p.id); setError(null);
    const { data, error } = await supabase.from('rent_payments').update(patch).eq('id', p.id).select('id');
    setBusy(null);
    if (error) { setError(planError(error.message)); return false; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return false; }
    await load(); onChanged();
    return true;
  };

  const backfill = async () => {
    if (busy) return;
    setBusy('backfill'); setError(null); setInfo(null);
    const { data, error } = await supabase.rpc('backfill_rent', { p_lease: leaseId, p_from: from, p_paid: paid });
    setBusy(null);
    if (error) { setError(planError(error.message)); return; }
    const n = Number(data ?? 0);
    setInfo(n > 0 ? t('{n} months added', { n }) : t('No new months to add.'));
    if (n > 0) { await load(); onChanged(); }
  };

  const remind = async (p: PaymentRow) => {
    const name = (person?.full_name ?? '').trim().split(/\s+/)[0] || '';
    const text = reminderMessage({ lang, name, property: propertyTitle, payment: p, office: office.name });
    const number = person?.whatsapp || person?.phone || null;
    const url = number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    if (canWrite) await update(p, { reminded_on: todayIso() });
  };

  const visible = (rows ?? []).filter(p => p.status !== 'cancelled');
  const list = all ? visible : visible.slice(0, SHOWN);
  const hidden = visible.length - list.length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('Rent payments')}</h3>
        <div className="flex items-center gap-1" role="group" aria-label={t('Language of the message')}>
          {SHARE_LANGS.map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      {rows === null && <p className="text-sm text-muted">…</p>}
      {rows !== null && list.length === 0 && (
        <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-muted">
          {t('No rent lines yet. They appear here from the first due date. Payments are tracked from the day the lease was added to the app.')}
        </p>
      )}

      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map(p => {
            const late = isOverdue(p);
            const n = daysTo(p.due_date);
            const state = p.status === 'paid'
              ? <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{t('Paid on {date}', { date: dateText(p.paid_on ?? p.due_date) })}</span>
              : p.status === 'cancelled'
                ? <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-bold text-muted">{t('Cancelled')}</span>
                : late
                  ? <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">{n === -1 ? t('Overdue by 1 day') : t('Overdue by {n} days', { n: -n })}</span>
                  : <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-bold text-muted">{n === 0 ? t('Due today') : t('Due in {n} days', { n })}</span>;
            return (
              <li key={p.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="tabular text-sm"><span className="font-semibold">{dateText(p.due_date)}</span> <span className="text-muted">· {formatMad(p.amount_cents)}</span></p>
                  {state}
                </div>
                {p.status === 'due' && canWrite && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => update(p, { status: 'paid', paid_on: todayIso() })}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ok/10 px-3 py-1.5 text-sm font-semibold text-ok transition hover:bg-ok/15 disabled:opacity-40"><Check className="h-4 w-4" /> {t('Mark as paid')}</button>
                    <button type="button" disabled={busy !== null} onClick={() => remind(p)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-line/10 transition hover:bg-surface-3 disabled:opacity-40"><MessageCircle className="h-4 w-4" /> {t('Send reminder')}</button>
                  </div>
                )}
                {p.status === 'due' && p.reminded_on && <p className="mt-1.5 text-xs text-muted">{t('Reminder sent on {date}', { date: dateText(p.reminded_on) })}</p>}
                {p.status === 'paid' && canWrite && (
                  <button type="button" disabled={busy !== null} onClick={() => update(p, { status: 'due' })}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /> {t('Undo')}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!all && hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm font-semibold text-brand">{t('Show all {n}', { n: visible.length })}</button>
      )}
      {canWrite && (
        <div className="mt-3">
          <button type="button" onClick={() => setBack(b => !b)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"><History className="h-4 w-4" /> {t('Add earlier months')}</button>
          {back && (
            <div className="mt-2 space-y-3 rounded-2xl bg-surface-2 px-3.5 py-3">
              <p className="text-xs text-muted">{t('Use this for a lease that started before it was added to the app. Months already in the list are kept.')}</p>
              <label className="block text-sm font-semibold">{t('Starting from')}
                <input type="date" min={startDate} max={todayIso()} value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block w-full rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-line/10" />
              </label>
              <fieldset>
                <legend className="text-sm font-semibold">{t('Were they paid?')}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {([true, false] as const).map(v => (
                    <button key={String(v)} type="button" aria-pressed={paid === v} onClick={() => setPaid(v)}
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${paid === v ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{v ? t('Yes, already paid') : t('No, still unpaid')}</button>
                  ))}
                </div>
              </fieldset>
              <Btn tone="brand" disabled={busy !== null || !from || from < startDate} onClick={backfill}>{t('Add months')}</Btn>
              {info && <p className="text-sm font-semibold text-ok">{info}</p>}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
