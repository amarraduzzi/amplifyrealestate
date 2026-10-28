import { useCallback, useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { DealView } from '../lib/deals';
import { loadInvoices, type InvoiceRow } from '../lib/invoices';
import { InvoiceForm } from '../pages/InvoiceForm';
import { InvoiceDoc } from '../pages/InvoiceDoc';
import { invoiceStatusCls, invoiceStatusLabel } from '../pages/Invoices';
import { Btn } from './ui';

/** In a deal: its invoices, and a button to make one for the commission. */
export function DealInvoices({ office, item }: { office: Office; item: DealView }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<InvoiceRow[] | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => setRows(await loadInvoices(office.id, { dealId: item.d.id })), [office.id, item.d.id]);
  useEffect(() => { load(); }, [load]);
  if (rows === undefined || rows === null || !canWrite) return null;
  const opened = rows.find(r => r.id === openId);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Receipt className="h-4 w-4" /> {t('Invoices')}</h3>
        <Btn tone="ghost" onClick={() => setAdding(true)}>{t('Make an invoice')}</Btn>
      </div>
      {rows.length === 0
        ? <p className="text-sm text-muted">{t('No invoice yet for this deal.')}</p>
        : (
          <ul className="space-y-1.5">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-start text-sm transition hover:ring-2 hover:ring-brand/25">
                  <span className="min-w-0 truncate"><span className="tabular font-semibold">{r.number}</span> <span className="text-muted">· {r.client_name}</span></span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-semibold">{formatMad(r.total_cents)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${invoiceStatusCls[r.status]}`}>{invoiceStatusLabel(r.status)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      {adding && <InvoiceForm office={office} deal={item} onClose={() => setAdding(false)} onCreated={id => { setAdding(false); load().then(() => setOpenId(id)); }} />}
      {opened && <InvoiceDoc office={office} invoice={opened} onClose={() => setOpenId(null)} onChanged={load} />}
    </section>
  );
}
