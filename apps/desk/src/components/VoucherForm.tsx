import { useState, type FormEvent } from 'react';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { voucherError, voucherWhatsapp } from '../lib/vouchers';
import { SignaturePad } from './SignaturePad';
import { Btn, Field, Modal, inputCls } from './ui';

export type VoucherProperty = { id: string; title: string; reference: string };

/**
 * Bon de visite: the visitor signs on the agent's phone that he saw this property through this agent.
 * Afterwards the copy goes to his WhatsApp in one tap.
 */
export function VoucherForm({ office, properties, propertyId, onClose, onSaved }: {
  office: Office; properties: VoucherProperty[]; propertyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [pid, setPid] = useState(propertyId ?? properties[0]?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [months, setMonths] = useState(12);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const prop = properties.find(p => p.id === pid);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pid) { setError(t('Choose a property.')); return; }
    if (name.trim().length < 2) { setError(t('Please enter the visitor’s name.')); return; }
    if (!sig) { setError(t('The visitor has to sign first.')); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('create_visit_voucher', { p_property: pid, p_name: name.trim(), p_phone: phone.trim(), p_signature: sig, p_months: months });
    setBusy(false);
    if (error) { setError(voucherError(error.message)); return; }
    setDone((data as { token: string }).token);
    onSaved();
  };

  if (done && prop) {
    return (
      <Modal title={t('Visit voucher signed')} onClose={onClose}
        footer={<div className="flex justify-end"><Btn tone="brand" onClick={onClose}>{t('Close')}</Btn></div>}>
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
          <p className="text-sm">{t('{name} signed for “{title}”. Send the copy now: then you both have it.', { name: name.trim(), title: prop.title })}</p>
          <a href={voucherWhatsapp(phone, done, prop.title)} target="_blank" rel="noreferrer"
            className="gold-fill inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-brand-ink">
            <MessageCircle className="h-5 w-5" /> {t('Send the copy on WhatsApp')}
          </a>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('Visit voucher')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="voucher-form" disabled={busy}>{busy ? '…' : t('Save the voucher')}</Btn></div>}>
      <form id="voucher-form" onSubmit={submit} className="space-y-4">
        {!propertyId && (
          <Field label={t('Property')}>
            <select className={inputCls} value={pid} onChange={e => setPid(e.target.value)} required>
              {properties.map(p => <option key={p.id} value={p.id}>{p.title} · {p.reference}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Name of the visitor')}><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="off" required /></Field>
          <Field label={t('Phone of the visitor')}><input className={inputCls} dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" autoComplete="off" required /></Field>
        </div>
        <Field label={t('Valid for')}>
          <select className={inputCls} value={months} onChange={e => setMonths(Number(e.target.value))}>
            {[6, 12, 18, 24].map(m => <option key={m} value={m}>{t('{n} months', { n: m })}</option>)}
          </select>
        </Field>
        <div className="rounded-2xl bg-surface-2 p-3.5 text-sm leading-relaxed">
          {t('I, {name}, confirm that I visited “{title}” today through {agent}. For {n} months I will not deal about this property directly with the owner or through someone else without {agent}.', {
            name: name.trim() || '…', title: prop?.title ?? '…', agent: office.name, n: months,
          })}
        </div>
        <SignaturePad label={t('Signature of the visitor')} onChange={setSig} />
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
