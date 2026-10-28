import { useState, type FormEvent } from 'react';
import { dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { CHANNELS, channelName, nights, stayError, type Channel, type Stay, type StayProp } from '../lib/stays';
import { planError } from '../lib/plan';
import { Btn, Field, Modal, inputCls } from '../components/ui';

const dh = (c: number | undefined) => (c ? String(c / 100) : '');
const toCents = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? dirhamToCents(v) : 0; };

/** A new booking, or a change to one. */
export function StayForm({ office, props, stay, defaults, onClose, onSaved }: {
  office: Office; props: StayProp[]; stay?: Stay; defaults?: { propertyId?: string; checkIn?: string }; onClose: () => void; onSaved: () => void;
}) {
  const canWrite = office.role !== 'viewer';
  const [f, setF] = useState({
    property: stay?.property_id ?? defaults?.propertyId ?? props[0]?.id ?? '',
    guest: stay?.guest_name ?? '', phone: stay?.guest_phone ?? '', channel: (stay?.channel ?? 'direct') as Channel,
    inDate: stay?.check_in ?? defaults?.checkIn ?? '', outDate: stay?.check_out ?? '', guests: stay?.guests ? String(stay.guests) : '',
    total: dh(stay?.total_cents), cleaning: dh(stay?.cleaning_cents), fee: dh(stay?.channel_fee_cents), notes: stay?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }));
  const n = f.inDate && f.outDate ? nights(f.inDate, f.outDate) : 0;
  const nightly = props.find(p => p.id === f.property)?.price_cents ?? null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.guest.trim()) { setError(t('Enter the name of the guest.')); return; }
    if (!f.inDate || !f.outDate || n <= 0) { setError(t('The departure must be after the arrival.')); return; }
    setBusy(true); setError(null);
    const row = {
      guest_name: f.guest.trim(), guest_phone: f.phone.trim() || null, channel: f.channel, check_in: f.inDate, check_out: f.outDate,
      guests: f.guests ? Math.max(1, Math.min(50, Number(f.guests) || 1)) : null, total_cents: toCents(f.total), cleaning_cents: toCents(f.cleaning),
      channel_fee_cents: toCents(f.fee), notes: f.notes.trim() || null,
    };
    const r = stay
      ? await supabase.from('stays').update(row).eq('id', stay.id).select('id')
      : await supabase.from('stays').insert({ ...row, org_id: office.id, property_id: f.property }).select('id');
    setBusy(false);
    if (r.error) { const m = stayError(r.error.message); setError(m ? t(m) : planError(r.error.message)); return; }
    onSaved();
  };
  const cancel = async () => {
    if (!stay || !window.confirm(t('Cancel this booking? The welcome and cleaning tasks are cancelled too.'))) return;
    const r = await supabase.from('stays').update({ status: 'cancelled' }).eq('id', stay.id).select('id');
    if (r.error) setError(planError(r.error.message)); else onSaved();
  };

  return (
    <Modal title={stay ? stay.guest_name : t('New booking')} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2">
        {stay && stay.status === 'confirmed' && canWrite && <Btn tone="ghost" onClick={cancel} className="me-auto">{t('Cancel booking')}</Btn>}
        <Btn onClick={onClose}>{t('Close')}</Btn>
        {canWrite && <Btn tone="brand" type="submit" form="stay-form" disabled={busy}>{t('Save')}</Btn>}
      </div>}>
      <form id="stay-form" onSubmit={save} className="space-y-4">
        <fieldset disabled={!canWrite} className="space-y-4">
          {stay?.status === 'cancelled' && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-muted">{t('This booking was cancelled.')}</p>}
          {!stay && (
            <Field label={t('Property')}>
              <select className={inputCls} value={f.property} onChange={e => set({ property: e.target.value })}>
                {props.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Guest')}><input className={inputCls} value={f.guest} onChange={e => set({ guest: e.target.value })} maxLength={200} /></Field>
            <Field label={t('Phone or WhatsApp')}><input className={inputCls} dir="ltr" value={f.phone} onChange={e => set({ phone: e.target.value })} maxLength={40} /></Field>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Channel')}>
            {CHANNELS.map(c => (
              <button key={c} type="button" aria-pressed={f.channel === c} onClick={() => set({ channel: c })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${f.channel === c ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{channelName(c, t('Other'))}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={t('Arrival')}><input type="date" className={inputCls} value={f.inDate} onChange={e => set({ inDate: e.target.value })} /></Field>
            <Field label={t('Departure')}><input type="date" className={inputCls} value={f.outDate} min={f.inDate || undefined} onChange={e => set({ outDate: e.target.value })} /></Field>
            <Field label={t('Guests')}><input className={inputCls} dir="ltr" inputMode="numeric" value={f.guests} onChange={e => set({ guests: e.target.value })} /></Field>
          </div>
          {n > 0 && <p className="text-sm text-muted">{n === 1 ? t('1 night') : t('{n} nights', { n })}{nightly ? ` · ${t('suggested price {amount}', { amount: `${(n * nightly / 100).toLocaleString('fr-MA')} DH` })}` : ''}</p>}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('Total paid by guest (DH)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={f.total} onChange={e => set({ total: e.target.value })} /></Field>
            <Field label={t('Of which cleaning (DH)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={f.cleaning} onChange={e => set({ cleaning: e.target.value })} /></Field>
            <Field label={t('Channel commission (DH)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={f.fee} onChange={e => set({ fee: e.target.value })} /></Field>
          </div>
          <Field label={t('Notes')}><textarea className={inputCls} rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} maxLength={1000} /></Field>
          <p className="text-xs text-muted">{t('A welcome task on the arrival day and a cleaning task on the departure day appear in the Agenda.')}</p>
        </fieldset>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
