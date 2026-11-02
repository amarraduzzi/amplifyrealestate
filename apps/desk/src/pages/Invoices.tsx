import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, Receipt, Search } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { getLang, t } from '../lib/i18n';
import { Hero, madShort, PhoneSheet } from '../components/Hero';
import type { Office } from '../lib/types';
import { loadInvoices, type InvoiceRow, type InvoiceStatus } from '../lib/invoices';
import { Btn, Card, inputCls, EmptyState } from '../components/ui';
import { AccentRow, type Tone } from '../components/Rows';
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
    <>
    <Hero
      title={t('Invoices')}
      action={(<div className="flex items-center gap-2">
        {canWrite && rows !== null && <button type="button" onClick={() => setAdding(true)} aria-label={t('New invoice')} title={t('New invoice')} className="grid h-11 w-11 place-items-center rounded-full bg-night-2 text-white ring-1 ring-white/20 transition active:scale-90 disabled:opacity-40"><FilePlus2 className="h-5 w-5" /></button>}
      </div>)}
      stats={[
        { value: (!rows) ? '–' : madShort(sums.open), label: t('To be collected'), warn: !(!rows) && sums.overdue > 0 },
        { value: (!rows) ? '–' : sums.overdue, label: t('Overdue'), warn: !(!rows) && sums.overdue > 0 },
        { value: (!rows) ? '–' : madShort(sums.paidYear), label: t('Paid in {year}', { year }) },
      ]}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3 max-lg:hidden">
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
          <EmptyState className="mt-6" icon={Receipt} title={t('No invoices yet')} text={t('Open a deal and tap "Make an invoice", or make one here. Fill in your invoice details under Settings first.')} />
        ) : (<>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="-mx-4 flex flex-nowrap gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {(['all', 'issued', 'paid', 'cancelled'] as const).map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
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
            {shown.map((r, n) => (
              <AccentRow key={r.id} tone={(({ issued: 'warn', paid: 'ok', cancelled: 'muted' }) as Record<string, Tone>)[r.status] ?? 'muted'} index={n} label={r.number} onOpen={() => setOpenId(r.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular font-semibold">{r.number}</p>
                    <p className="truncate text-sm text-muted">{r.client_name} · {dateText(r.issued_on)}</p>
                  </div>
                  <p className="font-display tabular shrink-0 text-lg font-bold leading-tight">{formatMad(r.total_cents)}</p>
                </div>
                <div className="mt-2.5"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${invoiceStatusCls[r.status]}`}>{invoiceStatusLabel(r.status)}</span></div>
              </AccentRow>
            ))}
            {shown.length === 0 && <p className="mt-6 text-center text-muted">{t('Nothing matches.')}</p>}
          </ul>
        </>)}
      </>)}

      {adding && <InvoiceForm office={office} onClose={() => setAdding(false)} onCreated={id => { setAdding(false); load().then(() => setOpenId(id)); }} />}
      {opened && <InvoiceDoc office={office} invoice={opened} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
    </PhoneSheet>
    </>
  );
}
