import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { DealView } from '../lib/deals';
import { billingReady, createInvoice, loadBilling, previewTotals, type Billing } from '../lib/invoices';
import { todayStr } from '../lib/dates';
import { planError } from '../lib/plan';
import { Btn, Field, Modal, inputCls } from '../components/ui';

type Line = { label: string; qty: string; amount: string };
type Party = { key: string; label: string; name: string };

function invoiceError(m: string): string {
  if (m.includes('billing_info_missing')) return t('Fill in the invoice details of your office first (Settings, Invoice details): name, ICE and IF.');
  if (m.includes('invoice_lines_invalid')) return t('Every line needs a description and an amount.');
  if (m.includes('client_ice')) return t('The ICE of the client has exactly 15 digits.');
  if (m.includes('client_name')) return t('Enter the name of the client.');
  return planError(m);
}

/** A new invoice or note d'honoraires, usually for the commission of a deal. The database gives the number. */
export function InvoiceForm({ office, deal, onClose, onCreated }: { office: Office; deal?: DealView; onClose: () => void; onCreated: (id: string) => void }) {
  const [billing, setBilling] = useState<Billing | null | undefined>(undefined);
  const [title, setTitle] = useState<'facture' | 'note_honoraires'>('facture');
  const [parties, setParties] = useState<Party[]>([]);
  const [party, setParty] = useState('other');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ice, setIce] = useState('');
  const [lines, setLines] = useState<Line[]>(() => {
    const p = deal?.property;
    const kind = p && p.purpose !== 'sale' ? 'Honoraires de location' : 'Honoraires de négociation';
    const label = p ? `${kind} : ${p.title} (${p.reference})` : 'Honoraires';
    const amt = deal?.d.commission_cents != null ? String(deal.d.commission_cents / 100) : '';
    return [{ label, qty: '1', amount: amt }];
  });
  const [issued, setIssued] = useState(todayStr());
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadBilling(office.id).then(setBilling); }, [office.id]);

  // Who can be invoiced for this deal: the client of the deal, or the owner of the property.
  useEffect(() => {
    if (!deal) return;
    let live = true;
    (async () => {
      const list: Party[] = [];
      if (deal.person) list.push({ key: 'client', label: t('Client of the deal'), name: deal.person.full_name });
      const o = await supabase.from('property_parties').select('person_id, people(full_name)').eq('property_id', deal.d.property_id).eq('role', 'owner').limit(1);
      const row = (o.data ?? [])[0] as { people: { full_name: string } | { full_name: string }[] | null } | undefined;
      const pe = row ? (Array.isArray(row.people) ? row.people[0] : row.people) : null;
      if (pe) list.push({ key: 'owner', label: t('Owner of the property'), name: pe.full_name });
      if (!live) return;
      setParties(list);
      if (list[0]) { setParty(list[0].key); setName(list[0].name); }
    })();
    return () => { live = false; };
  }, [deal]);

  const ae = billing?.legal_form === 'auto_entrepreneur';
  const rate = billing ? (ae ? 0 : Number(billing.vat_rate)) : 0;
  const parsed = useMemo(() => lines.map(l => ({ label: l.label.trim(), qty: Number(l.qty.replace(',', '.')), unit_cents: dirhamToCents(Number(l.amount.replace(',', '.').replace(/\s/g, ''))) })), [lines]);
  const totals = previewTotals(parsed.map(l => ({ qty: Number.isFinite(l.qty) ? l.qty : 0, unit_cents: Number.isFinite(l.unit_cents) ? l.unit_cents : 0 })), rate);

  const pickParty = (k: string) => { setParty(k); const p = parties.find(x => x.key === k); setName(p ? p.name : ''); };
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) { setError(t('Enter the name of the client.')); return; }
    const iceClean = ice.replace(/\s/g, '');
    if (iceClean && !/^\d{15}$/.test(iceClean)) { setError(t('The ICE of the client has exactly 15 digits.')); return; }
    if (parsed.some(l => !l.label || !Number.isFinite(l.qty) || l.qty <= 0 || !Number.isFinite(l.unit_cents) || l.unit_cents < 0)) { setError(t('Every line needs a description and an amount.')); return; }
    if (due && due < issued) { setError(t('The due date cannot be before the invoice date.')); return; }
    setBusy(true); setError(null);
    try {
      const id = await createInvoice({ orgId: office.id, dealId: deal?.d.id ?? null, title, clientName: name.trim(), clientAddress: address.trim(), clientIce: iceClean,
        lines: parsed, issuedOn: issued, dueOn: due || null, notes: notes.trim() });
      onCreated(id);
    } catch (err) { setError(invoiceError(err instanceof Error ? err.message : String(err))); setBusy(false); }
  };

  const ready = billingReady(billing ?? null);
  return (
    <Modal title={t('New invoice')} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Btn type="button" onClick={onClose}>{t('Cancel')}</Btn>
        <Btn tone="brand" type="submit" form="invoice-form" disabled={busy || !ready}>{t('Create invoice')}</Btn>
      </div>}>
      {billing === undefined ? <p className="text-center text-muted">…</p> : billing === null ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 6f first.')}</p>
      ) : (
        <form id="invoice-form" onSubmit={submit} className="space-y-4">
          {!ready && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Fill in the invoice details of your office first (Settings, Invoice details): name, ICE and IF.')}</p>}
          <div className="flex flex-wrap gap-1.5" role="group">
            {(['facture', 'note_honoraires'] as const).map(x => (
              <button key={x} type="button" aria-pressed={title === x} onClick={() => setTitle(x)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${title === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                {x === 'facture' ? t('Invoice') : t("Fee note (note d'honoraires)")}
              </button>
            ))}
          </div>

          {parties.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Client')}>
              {[...parties, { key: 'other', label: t('Someone else'), name: '' }].map(p => (
                <button key={p.key} type="button" aria-pressed={party === p.key} onClick={() => pickParty(p.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${party === p.key ? 'bg-brand text-white' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {p.label}{p.name ? `: ${p.name}` : ''}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Client name')}><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={200} /></Field>
            <Field label={t('ICE of the client')} hint={t('Only for a company. 15 digits.')}><input className={inputCls} dir="ltr" inputMode="numeric" value={ice} onChange={e => setIce(e.target.value)} maxLength={20} /></Field>
          </div>
          <Field label={t('Address of the client')}><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} maxLength={300} /></Field>

          <div>
            <p className="mb-1 text-sm font-semibold">{t('Lines')} <span className="font-normal text-muted">({ae ? t('amounts') : t('amounts without VAT')})</span></p>
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_4rem_7rem_auto] items-center gap-2">
                  <input className={inputCls} value={l.label} onChange={e => setLine(i, { label: e.target.value })} maxLength={300} aria-label={t('Description')} placeholder={t('Description')} />
                  <input className={inputCls} dir="ltr" inputMode="decimal" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} aria-label={t('Quantity')} />
                  <input className={inputCls} dir="ltr" inputMode="decimal" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })} aria-label={t('Amount (DH)')} placeholder="DH" />
                  <button type="button" disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label={t('Remove')}
                    className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            {lines.length < 20 && <button type="button" onClick={() => setLines(ls => [...ls, { label: '', qty: '1', amount: '' }])} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><Plus className="h-4 w-4" /> {t('Add a line')}</button>}
          </div>

          <div className="space-y-0.5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            {ae ? (
              <p className="flex justify-between font-bold"><span>{t('Total')}</span><span className="tabular">{formatMad(totals.total)}</span></p>
            ) : (<>
              <p className="flex justify-between"><span>{t('Total without VAT')}</span><span className="tabular">{formatMad(totals.sub)}</span></p>
              <p className="flex justify-between"><span>{t('VAT {rate}%', { rate })}</span><span className="tabular">{formatMad(totals.vat)}</span></p>
              <p className="flex justify-between font-bold"><span>{t('Total with VAT')}</span><span className="tabular">{formatMad(totals.total)}</span></p>
            </>)}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Invoice date')}><input type="date" className={inputCls} value={issued} onChange={e => setIssued(e.target.value)} /></Field>
            <Field label={t('Due date (optional)')}><input type="date" className={inputCls} value={due} min={issued} onChange={e => setDue(e.target.value)} /></Field>
          </div>
          <Field label={t('Note on the invoice (optional)')}><textarea className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} /></Field>
          <p className="text-xs text-muted">{t('After creating, the invoice cannot be changed. A mistake? Cancel it and make a new one.')}</p>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
