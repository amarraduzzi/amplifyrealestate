import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, Receipt, Search } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadInvoices, type InvoiceRow, type InvoiceStatus } from '../lib/invoices';
import { Btn, Card, inputCls } from '../components/ui';
import { InvoiceForm } from './InvoiceForm';
import { InvoiceDoc } from './InvoiceDoc';

export const invoiceStatusLabel = (s: InvoiceStatus) => t(({ issued: 'To be paid', paid: 'Paid', cancelled: 'Cancelled' } as const)[s]);
export const invoiceStatusCls: Record<InvoiceStatus, string> = { issued: 'bg-warn/10 text-warn', paid: 'bg-ok/10 text-ok', cancelled: 'bg-surface-2 text-muted' };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const dateText = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
type Filter = 'all' | InvoiceStatus;

/** All invoices and fee notes of the office, with what is still to be collected. */
export function Invoices({ office }: { office: Office }) {
  const [rows, setRows] = useState<InvoiceRow[] | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => setRows(await loadInvoices(office.id)), [office.id]);
  useEffect(() => { setRows(undefined); load(); }, [load]);

  const year = new Date().getFullYear();
  const sums = useMemo(() => {
    const r = { open: 0, openN: 0, paidYear: 0, overdue: 0 };
    const today = new Date().toISOString().slice(0, 10);
    for (const x of rows ?? []) {
      if (x.status === 'issued') { r.open += x.total_cents; r.openN++; if (x.due_on && x.due_on < today) r.overdue++; }
      if (x.status === 'paid' && x.paid_on?.startsWith(String(year))) r.paidYear += x.total_cents;
    }
    return r;
  }, [rows, year]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter(r => (filter === 'all' || r.status === filter) && (!n || r.number.toLowerCase().includes(n) || r.client_name.toLowerCase().includes(n)));
  }, [rows, filter, q]);
  const opened = rows?.find(r => r.id === openId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Invoices')}</h1>
          <p className="text-sm text-muted">{t('Invoices and fee notes for your commission.')}</p>
        </div>
        {canWrite && rows !== null && <Btn tone="brand" onClick={() => setAdding(true)}><FilePlus2 className="h-4 w-4" /> {t('New invoice')}</Btn>}
      </div>

      {rows === undefined && <p className="mt-10 text-center text-muted">…</p>}
      {rows === null && <p className="mt-6 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 6f first.')}</p>}

      {rows && (<>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Card><p className="text-sm text-muted">{t('To be collected')}</p><p className="font-display tabular mt-1 text-2xl font-bold text-warn">{formatMad(sums.open)}</p><p className="text-xs text-muted">{sums.openN === 1 ? t('1 invoice') : t('{n} invoices', { n: sums.openN })}{sums.overdue ? ` · ${t('{n} past due date', { n: sums.overdue })}` : ''}</p></Card>
          <Card><p className="text-sm text-muted">{t('Paid in {year}', { year })}</p><p className="font-display tabular mt-1 text-2xl font-bold text-ok">{formatMad(sums.paidYear)}</p></Card>
          <Card><p className="text-sm text-muted">{t('Invoices in total')}</p><p className="font-display tabular mt-1 text-2xl font-bold">{rows.length}</p></Card>
        </div>

        {rows.length === 0 ? (
          <Card className="mt-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Receipt className="h-6 w-6" /></span>
            <h2 className="font-display mt-3 text-xl font-bold">{t('No invoices yet')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Open a deal and tap "Make an invoice", or make one here. Fill in your invoice details under Settings first.')}</p>
          </Card>
        ) : (<>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {(['all', 'issued', 'paid', 'cancelled'] as const).map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : invoiceStatusLabel(f)}
                </button>
              ))}
            </div>
            <div className="relative sm:ms-auto sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} ps-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {shown.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="card flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-start transition hover:ring-2 hover:ring-brand/30">
                  <span className="min-w-0">
                    <span className="tabular block font-semibold">{r.number}</span>
                    <span className="block truncate text-sm text-muted">{r.client_name} · {dateText(r.issued_on)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-display tabular font-bold">{formatMad(r.total_cents)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${invoiceStatusCls[r.status]}`}>{invoiceStatusLabel(r.status)}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <p className="mt-6 text-center text-muted">{t('Nothing matches.')}</p>}
          </ul>
        </>)}
      </>)}

      {adding && <InvoiceForm office={office} onClose={() => setAdding(false)} onCreated={id => { setAdding(false); load().then(() => setOpenId(id)); }} />}
      {opened && <InvoiceDoc office={office} invoice={opened} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
