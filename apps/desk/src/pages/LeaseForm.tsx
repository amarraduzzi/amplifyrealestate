import { useEffect, useState, type FormEvent } from 'react';
import { dirhamToCents, formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeaseRow } from '../lib/types';
import { leaseError, type LeaseProp } from '../lib/leases';
import { planError } from '../lib/plan';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

type PropOpt = LeaseProp & { price_cents: number | null };
type Person = { id: string; full_name: string };
const NEW = '__new__';
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const show = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Start a lease (tenant, property, rent, deposit, dates), or change the money, dates and notes of a running one. */
export function LeaseForm({ orgId, lease, propertyId, onClose, onSaved }: {
  orgId: string; lease?: LeaseRow; propertyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!lease;
  const [props, setProps] = useState<PropOpt[] | null>(editing ? [] : null);
  const [people, setPeople] = useState<Person[]>([]);
  const [property, setProperty] = useState(propertyId ?? '');
  const [tenant, setTenant] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [rent, setRent] = useState(lease ? show(lease.rent_cents / 100) : '');
  const [deposit, setDeposit] = useState(lease?.deposit_cents == null ? '' : show(lease.deposit_cents / 100));
  const [start, setStart] = useState(lease?.start_date ?? todayIso());
  const [end, setEnd] = useState(lease?.end_date ?? '');
  const [day, setDay] = useState(String(lease?.payment_day ?? 1));
  const [notes, setNotes] = useState(lease?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      const [pr, pe, ls] = await Promise.all([
        supabase.from('properties').select('id, title, reference, price_cents, purpose, status').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('people').select('id, full_name').eq('org_id', orgId).order('full_name'),
        supabase.from('leases').select('property_id').eq('org_id', orgId).eq('status', 'active'),
      ]);
      if (cancelled) return;
      const err = pr.error ?? pe.error ?? ls.error;
      if (err) { setError(friendly(err)); setProps([]); return; }
      const taken = new Set(((ls.data ?? []) as { property_id: string }[]).map(x => x.property_id));
      const opts = ((pr.data ?? []) as (PropOpt & { purpose: string; status: string })[])
        .filter(x => (x.purpose === 'rent_long' || x.purpose === 'rent_short') && (x.status === 'available' || x.status === 'reserved' || x.id === propertyId) && !taken.has(x.id));
      setProps(opts);
      setPeople((pe.data ?? []) as Person[]);
      setProperty(cur => cur || opts[0]?.id || '');
      setTenant(((pe.data ?? []) as Person[])[0]?.id ?? NEW);
    })();
    return () => { cancelled = true; };
  }, [orgId, editing, propertyId]);

  // The rent starts at the asking price of the chosen property.
  useEffect(() => {
    if (editing) return;
    const p = props?.find(x => x.id === property);
    if (p?.price_cents != null) setRent(String(p.price_cents / 100));
  }, [property, props, editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = num(rent); const dp = num(deposit); const pd = Number(day);
    if (r === null || !Number.isFinite(r) || r <= 0) { setError(t('Enter the monthly rent.')); return; }
    if (dp !== null && (!Number.isFinite(dp) || dp < 0)) { setError(t('The deposit cannot be negative.')); return; }
    if (!Number.isInteger(pd) || pd < 1 || pd > 28) { setError(t('The payment day must be between 1 and 28.')); return; }
    if (!start) { setError(t('Enter the start date.')); return; }
    if (end && end < start) { setError(t('The end date cannot be before the start date.')); return; }
    const fields = {
      rent_cents: dirhamToCents(r), deposit_cents: dp === null ? null : dirhamToCents(dp),
      start_date: start, end_date: end || null, payment_day: pd, notes: notes.trim() || null,
    };
    setBusy(true); setError(null);

    if (lease) {
      const { data, error } = await supabase.from('leases').update(fields).eq('id', lease.id).select('id');
      setBusy(false);
      if (error) { const m = leaseError(error.message); setError(m ? t(m) : planError(error.message)); }
      else if (!data?.length) setError(t('You do not have permission to change this.'));
      else onSaved();
      return;
    }

    if (!property) { setBusy(false); setError(t('Choose a property.')); return; }
    let tenantId = tenant;
    if (tenant === NEW) {
      if (!newName.trim()) { setBusy(false); setError(t('Enter the name of the tenant.')); return; }
      const ins = await supabase.from('people').insert({ org_id: orgId, full_name: newName.trim(), phone: newPhone.trim() || null }).select('id').single();
      if (ins.error || !ins.data) { setBusy(false); setError(planError(ins.error?.message ?? 'error')); return; }
      tenantId = (ins.data as { id: string }).id;
    }
    const { error } = await supabase.from('leases').insert({ org_id: orgId, property_id: property, tenant_person_id: tenantId, ...fields });
    setBusy(false);
    if (error) { const m = leaseError(error.message); setError(m ? t(m) : planError(error.message)); return; }
    onSaved();
  };

  const noProps = !editing && props !== null && props.length === 0;
  const chosen = props?.find(x => x.id === property);

  return (
    <Modal title={editing ? t('Edit lease') : t('Start a lease')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="lease-form" disabled={busy || props === null || noProps}>{busy ? '…' : editing ? t('Save changes') : t('Start lease')}</Btn></div>}>
      <form id="lease-form" onSubmit={submit} className="space-y-4">
        {!editing && props !== null && (
          <>
            <Field label={t('Property')}>
              <select className={inputCls} value={property} onChange={e => setProperty(e.target.value)} disabled={!!propertyId} required>
                {props.map(x => <option key={x.id} value={x.id}>{x.title} · {x.reference}</option>)}
              </select>
            </Field>
            {noProps && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{t('There is no available or reserved rental property without a running lease.')}</p>}
            <Field label={t('Tenant')}>
              <select className={inputCls} value={tenant} onChange={e => setTenant(e.target.value)}>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                <option value={NEW}>{t('New person…')}</option>
              </select>
            </Field>
            {tenant === NEW && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('Full name')}><input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} required /></Field>
                <Field label={t('Phone')}><input className={inputCls} dir="ltr" inputMode="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} /></Field>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Monthly rent (DH)')} hint={chosen?.price_cents != null ? t('Asking price: {price}', { price: formatMad(chosen.price_cents) }) : undefined}>
            <input className={inputCls} inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} required />
          </Field>
          <Field label={t('Deposit (DH)')}>
            <input className={inputCls} inputMode="decimal" value={deposit} onChange={e => setDeposit(e.target.value)} />
          </Field>
          <Field label={t('Start date')}><input className={inputCls} dir="ltr" type="date" value={start} onChange={e => setStart(e.target.value)} required /></Field>
          <Field label={t('End date')} hint={t('Leave empty if there is no end date.')}><input className={inputCls} dir="ltr" type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
        </div>
        <Field label={t('Rent is due on day')} hint={t('Day of the month, 1 to 28.')}>
          <input className={inputCls} dir="ltr" type="number" min={1} max={28} value={day} onChange={e => setDay(e.target.value)} required />
        </Field>
        <Field label={t('Notes')} hint={t('For example the conditions, or where the signed contract is kept.')}>
          <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
