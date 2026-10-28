import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { amountInWords, setInvoiceStatus, type InvoiceRow, type PaymentMethod } from '../lib/invoices';
import { planError } from '../lib/plan';
import { Btn } from '../components/ui';

// The invoice itself is always in French: that is the language of invoices in Morocco.
const frDate = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const METHOD_FR: Record<PaymentMethod, string> = { transfer: 'Virement bancaire', cheque: 'Chèque', cash: 'Espèces', card: 'Carte bancaire', other: 'Autre' };
const METHODS: PaymentMethod[] = ['transfer', 'cheque', 'cash', 'card', 'other'];
const methodLabel = (m: PaymentMethod) => t(({ transfer: 'Bank transfer', cheque: 'Cheque', cash: 'Cash', card: 'Card', other: 'Other' } as const)[m]);

/** One invoice as a printable A4 sheet, with the actions around it (print or save as PDF, paid, cancel). */
export function InvoiceDoc({ office, invoice, onClose, onChanged }: { office: Office; invoice: InvoiceRow; onClose: () => void; onChanged: () => void }) {
  const canManage = office.role === 'owner' || office.role === 'manager';
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = invoice, s = inv.seller;
  const ae = s.form === 'auto_entrepreneur';
  const isNote = inv.title === 'note_honoraires';

  const act = async (status: 'paid' | 'cancelled') => {
    if (busy) return;
    if (status === 'cancelled' && !window.confirm(t('Cancel this invoice? The number stays in the list as cancelled. Make a new invoice if something was wrong.'))) return;
    setBusy(true); setError(null);
    const err = await setInvoiceStatus(inv.id, status, method);
    setBusy(false);
    if (err) setError(planError(err)); else onChanged();
  };

  const legal = [s.name, s.ice && `ICE : ${s.ice}`, s.if && `IF : ${s.if}`, !ae && s.rc && `RC : ${s.rc}`, s.tp && `TP : ${s.tp}`].filter(Boolean).join(' · ');

  return createPortal((
    <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-2xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir="ltr" lang="fr">
        <div className="no-print mb-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
            <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
          </div>
          {canManage && inv.status === 'issued' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.04] p-2.5">
              <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} aria-label={t('Payment method')}
                className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm">
                {METHODS.map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
              <Btn tone="brand" disabled={busy} onClick={() => act('paid')}><CheckCircle2 className="h-4 w-4" /> {t('Mark as paid')}</Btn>
              <Btn tone="ghost" disabled={busy} onClick={() => act('cancelled')} className="ms-auto"><Ban className="h-4 w-4" /> {t('Cancel invoice')}</Btn>
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>

        {/* ---- The invoice ---- */}
        <div className="relative text-[13px] leading-snug">
          {inv.status !== 'issued' && (
            <div className={`pointer-events-none absolute right-0 top-24 rotate-[-8deg] rounded-lg border-4 px-4 py-1 text-xl font-black uppercase tracking-widest opacity-70 ${inv.status === 'paid' ? 'border-green-700 text-green-700' : 'border-red-700 text-red-700'}`}>
              {inv.status === 'paid' ? `Payée le ${frDate(inv.paid_on!)}` : 'Annulée'}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[60%]">
              <p className="text-lg font-bold">{s.name}</p>
              {ae && <p className="text-xs">Auto-entrepreneur</p>}
              {s.address && <p>{s.address}</p>}
              {(s.phone || s.email) && <p>{[s.phone, s.email].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="text-right">
              <p className="text-xl font-black uppercase tracking-wide">{isNote ? "Note d'honoraires" : 'Facture'}</p>
              <p className="font-semibold">N° {inv.number}</p>
              <p>Date : {frDate(inv.issued_on)}</p>
              {inv.due_on && <p>Échéance : {frDate(inv.due_on)}</p>}
            </div>
          </div>

          <div className="mt-6 ms-auto w-full max-w-xs rounded-lg border border-black/15 p-3 sm:w-1/2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/60">Client</p>
            <p className="font-semibold">{inv.client_name}</p>
            {inv.client_address && <p>{inv.client_address}</p>}
            {inv.client_ice && <p>ICE : {inv.client_ice}</p>}
          </div>

          <table className="mt-6 w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black/70 text-left text-[11px] uppercase tracking-wide">
                <th className="py-1.5 pr-2">Désignation</th>
                <th className="w-12 py-1.5 text-right">Qté</th>
                <th className="w-28 py-1.5 text-right">P.U. {ae ? '' : 'HT'}</th>
                <th className="w-28 py-1.5 text-right">Total {ae ? '' : 'HT'}</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i} className="border-b border-black/10 align-top">
                  <td className="py-2 pr-2">{l.label}</td>
                  <td className="tabular py-2 text-right">{Number(l.qty)}</td>
                  <td className="tabular py-2 text-right">{formatMad(l.unit_cents)}</td>
                  <td className="tabular py-2 text-right">{formatMad(l.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 ms-auto w-full max-w-xs space-y-1">
            {ae ? (
              <>
                <div className="flex justify-between border-t-2 border-black/70 pt-1.5 text-base font-bold"><span>Total</span><span className="tabular">{formatMad(inv.total_cents)}</span></div>
                <p className="text-xs">TVA non applicable (auto-entrepreneur).</p>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span>Total HT</span><span className="tabular">{formatMad(inv.subtotal_cents)}</span></div>
                <div className="flex justify-between"><span>TVA {Number(inv.vat_rate)} %</span><span className="tabular">{formatMad(inv.vat_cents)}</span></div>
                <div className="flex justify-between border-t-2 border-black/70 pt-1.5 text-base font-bold"><span>Total TTC</span><span className="tabular">{formatMad(inv.total_cents)}</span></div>
              </>
            )}
          </div>

          <p className="mt-5">
            Arrêtée la présente {isNote ? "note d'honoraires" : 'facture'} à la somme de : <span className="font-semibold">{amountInWords(inv.total_cents)}</span>{ae ? '' : ' TTC'}.
          </p>

          {inv.notes && <p className="mt-3 whitespace-pre-line">{inv.notes}</p>}

          <div className="mt-5 space-y-0.5">
            {inv.status === 'paid' && inv.payment_method && <p>Mode de paiement : {METHOD_FR[inv.payment_method]}</p>}
            {s.rib && <p>RIB : <span className="tabular">{s.rib}</span></p>}
            {s.footer && <p>{s.footer}</p>}
          </div>

          <p className="mt-8 border-t border-black/15 pt-2 text-center text-[11px] text-black/70">{legal}</p>
        </div>
      </div>
    </div>
  ), document.body);
}
