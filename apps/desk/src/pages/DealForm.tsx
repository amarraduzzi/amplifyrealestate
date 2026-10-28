import { useEffect, useState, type FormEvent } from 'react';
import { dirhamToCents, formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { DealRow, LeadRow } from '../lib/types';
import { OPEN_LEAD_STATUSES, priceSuffix, purposeLabel } from '../lib/labels';
import { dealError, type DealProp } from '../lib/deals';
import { planError } from '../lib/plan';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

type LeadOpt = { lead: LeadRow; name: string };
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const show = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));

/**
 * Start a deal (a lead and a property agree on a price and a commission), or change the price, commission and notes of an
 * existing deal. leadId / propertyId lock one side when the form is opened from a viewing.
 */
export function DealForm({ orgId, deal, leadId, propertyId, onClose, onSaved }: {
  orgId: string; deal?: DealRow; leadId?: string; propertyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!deal;
  const [leads, setLeads] = useState<LeadOpt[] | null>(editing ? [] : null);
  const [props, setProps] = useState<DealProp[]>([]);
  const [lead, setLead] = useState(leadId ?? '');
  const [property, setProperty] = useState(propertyId ?? '');
  const [price, setPrice] = useState(deal ? show(deal.price_cents / 100) : '');
  const [pct, setPct] = useState(show(deal?.commission_pct));
  const [amount, setAmount] = useState(deal?.commission_cents == null ? '' : show(deal.commission_cents / 100));
  const [touched, setTouched] = useState(!!deal?.commission_cents);
  const [notes, setNotes] = useState(deal?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      const [l, p, pr] = await Promise.all([
        supabase.from('leads').select('*').eq('org_id', orgId),
        supabase.from('people').select('id, full_name').eq('org_id', orgId),
        supabase.from('properties').select('id, title, reference, purpose, status, price_cents').eq('org_id', orgId).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      const err = l.error ?? p.error ?? pr.error;
      if (err) { setError(friendly(err)); setLeads([]); return; }
      const names = new Map(((p.data ?? []) as { id: string; full_name: string }[]).map(x => [x.id, x.full_name]));
      const lopts = ((l.data ?? []) as LeadRow[])
        .filter(x => OPEN_LEAD_STATUSES.includes(x.status) || x.id === leadId)
        .map(x => ({ lead: x, name: names.get(x.person_id) ?? '…' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const popts = ((pr.data ?? []) as DealProp[]).filter(x => x.status === 'available' || x.status === 'reserved' || x.id === propertyId);
      setLeads(lopts);
      setProps(popts);
      setLead(cur => cur || lopts[0]?.lead.id || '');
      setProperty(cur => cur || popts[0]?.id || '');
    })();
    return () => { cancelled = true; };
  }, [orgId, editing, leadId, propertyId]);

  // The price starts at the asking price of the chosen property.
  useEffect(() => {
    if (editing) return;
    const p = props.find(x => x.id === property);
    if (p?.price_cents != null) setPrice(String(p.price_cents / 100));
  }, [property, props, editing]);

  // The commission amount follows price and percentage until it is typed by hand.
  useEffect(() => {
    if (touched) return;
    const pr = num(price); const pc = num(pct);
    if (pr !== null && pc !== null && Number.isFinite(pr) && Number.isFinite(pc)) setAmount(String(Math.round(pr * pc) / 100));
    else setAmount('');
  }, [price, pct, touched]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pr = num(price); const pc = num(pct); const am = num(amount);
    if (pr === null || !Number.isFinite(pr) || pr <= 0) { setError(t('Enter the agreed price.')); return; }
    if ((pc !== null && (!Number.isFinite(pc) || pc < 0 || pc > 100)) || (am !== null && (!Number.isFinite(am) || am < 0))) {
      setError(t('Please check the commission: it cannot be negative, and a percentage is at most 100.')); return;
    }
    const fields = {
      price_cents: dirhamToCents(pr),
      commission_pct: pc,
      commission_cents: am === null ? null : dirhamToCents(am),
      notes: notes.trim() || null,
    };
    setBusy(true); setError(null);

    if (deal) {
      const { data, error } = await supabase.from('deals').update(fields).eq('id', deal.id).select('id');
      setBusy(false);
      if (error) setError(planError(error.message));
      else if (!data?.length) setError(t('You do not have permission to change this.'));
      else onSaved();
      return;
    }

    if (!lead || !property) { setBusy(false); setError(t('Choose a lead and a property.')); return; }
    const { error } = await supabase.from('deals').insert({ org_id: orgId, lead_id: lead, property_id: property, ...fields });
    setBusy(false);
    if (error) { const d = dealError(error.message); setError(d ? t(d) : planError(error.message)); return; }
    onSaved();
  };

  const noOptions = !editing && leads !== null && (leads.length === 0 || props.length === 0);
  const chosen = props.find(x => x.id === property);
  const suffix = chosen ? priceSuffix(chosen.purpose) : '';

  return (
    <Modal title={editing ? t('Edit deal') : t('Start a deal')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="deal-form" disabled={busy || leads === null || noOptions}>{busy ? '…' : editing ? t('Save changes') : t('Start deal')}</Btn></div>}>
      <form id="deal-form" onSubmit={submit} className="space-y-4">
        {!editing && leads !== null && (
          <>
            <Field label={t('Lead')}>
              <select className={inputCls} value={lead} onChange={e => setLead(e.target.value)} disabled={!!leadId} required>
                {leads.map(x => <option key={x.lead.id} value={x.lead.id}>{x.name} · {purposeLabel(x.lead.purpose)}</option>)}
              </select>
            </Field>
            <Field label={t('Property')}>
              <select className={inputCls} value={property} onChange={e => setProperty(e.target.value)} disabled={!!propertyId} required>
                {props.map(x => <option key={x.id} value={x.id}>{x.title} · {x.reference}</option>)}
              </select>
            </Field>
            {noOptions && (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
                {leads.length === 0 ? t('Add a lead first: a deal is between a lead and a property.') : t('There is no available or reserved property for a deal yet.')}
              </p>
            )}
          </>
        )}
        <Field label={`${t('Agreed price (DH)')}${suffix ? ' ' + suffix : ''}`} hint={chosen?.price_cents != null ? t('Asking price: {price}', { price: formatMad(chosen.price_cents) }) : undefined}>
          <input className={inputCls} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Commission (%)')}>
            <input className={inputCls} inputMode="decimal" value={pct} onChange={e => { setPct(e.target.value); setTouched(false); }} />
          </Field>
          <Field label={t('Commission (DH)')}>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setTouched(true); }} />
          </Field>
        </div>
        <Field label={t('Notes')} hint={t('For example the conditions, or when the contract is planned.')}>
          <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
