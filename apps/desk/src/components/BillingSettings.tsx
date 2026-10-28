import { useEffect, useState, type FormEvent } from 'react';
import { Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { BILLING_COLUMNS, type Billing } from '../lib/invoices';
import { Btn, Card, Field, inputCls } from './ui';
import { friendly } from '../lib/errors';

const EMPTY: Billing = { legal_name: '', legal_form: 'company', legal_address: '', ice: '', if_number: '', rc_number: '', tp_number: '', rib: '', vat_rate: 20, invoice_footer: '' };

/** The details every invoice needs (article 145 CGI): name, form, address, ICE, IF, RC, taxe professionnelle. */
export function BillingSettings({ office, canManage }: { office: Office; canManage: boolean }) {
  const [b, setB] = useState<Billing | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('organizations').select(BILLING_COLUMNS).eq('id', office.id).maybeSingle().then(({ data, error }) => {
      if (error) { setB(null); return; } // etappe 6f not installed yet
      const d = (data ?? {}) as Partial<Billing>;
      setB({ ...EMPTY, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? (k === 'vat_rate' ? 20 : k === 'legal_form' ? 'company' : '')])) } as Billing);
    });
  }, [office.id]);

  if (b === undefined || b === null) return null;
  const set = (patch: Partial<Billing>) => { setSaved(false); setB(x => ({ ...(x as Billing), ...patch })); };
  const clean = (s: string | null) => (s ?? '').trim() || null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ice = (b.ice ?? '').replace(/\s/g, '');
    if (ice && !/^\d{15}$/.test(ice)) { setError(t('The ICE has exactly 15 digits.')); return; }
    const rate = Number(String(b.vat_rate).replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate > 30) { setError(t('Enter a VAT rate between 0 and 30%.')); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('organizations').update({
      legal_name: clean(b.legal_name), legal_form: b.legal_form, legal_address: clean(b.legal_address), ice: ice || null,
      if_number: clean(b.if_number), rc_number: clean(b.rc_number), tp_number: clean(b.tp_number), rib: clean(b.rib),
      vat_rate: rate, invoice_footer: clean(b.invoice_footer),
    }).eq('id', office.id).select('id');
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return; }
    setSaved(true);
  };

  const ae = b.legal_form === 'auto_entrepreneur';
  return (
    <Card className="mt-6">
      <h2 className="font-display flex items-center gap-2 text-lg font-semibold"><Receipt className="h-5 w-5 text-brand" /> {t('Invoice details')}</h2>
      <p className="mt-1 text-sm text-muted">{t('These appear on every invoice. Name, ICE and IF are required to make an invoice.')}</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <fieldset disabled={!canManage} className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Legal form')}>
            {(['company', 'auto_entrepreneur'] as const).map(f => (
              <button key={f} type="button" aria-pressed={b.legal_form === f} onClick={() => set({ legal_form: f })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${b.legal_form === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                {f === 'company' ? t('Company (SARL, SA...)') : t('Auto-entrepreneur')}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Name on the invoice')}><input className={inputCls} value={b.legal_name ?? ''} onChange={e => set({ legal_name: e.target.value })} maxLength={200} placeholder={office.name} /></Field>
            <Field label={t('Address')}><input className={inputCls} value={b.legal_address ?? ''} onChange={e => set({ legal_address: e.target.value })} maxLength={300} /></Field>
            <Field label="ICE" hint={t('15 digits')}><input className={inputCls} dir="ltr" inputMode="numeric" value={b.ice ?? ''} onChange={e => set({ ice: e.target.value })} maxLength={20} /></Field>
            <Field label={t('IF (tax identifier)')}><input className={inputCls} dir="ltr" value={b.if_number ?? ''} onChange={e => set({ if_number: e.target.value })} maxLength={30} /></Field>
            {!ae && <Field label={t('RC (trade register)')}><input className={inputCls} dir="ltr" value={b.rc_number ?? ''} onChange={e => set({ rc_number: e.target.value })} maxLength={60} /></Field>}
            <Field label={t('Taxe professionnelle')}><input className={inputCls} dir="ltr" value={b.tp_number ?? ''} onChange={e => set({ tp_number: e.target.value })} maxLength={30} /></Field>
            <Field label={t('RIB (for bank transfers)')}><input className={inputCls} dir="ltr" value={b.rib ?? ''} onChange={e => set({ rib: e.target.value })} maxLength={60} /></Field>
            {ae
              ? <p className="self-end rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">{t('Auto-entrepreneur: no VAT. The invoice says "TVA non applicable".')}</p>
              : <Field label={t('VAT rate (%)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={String(b.vat_rate)} onChange={e => set({ vat_rate: e.target.value as unknown as number })} /></Field>}
          </div>
          <Field label={t('Text at the bottom of the invoice (optional)')} hint={t('For example payment terms.')}>
            <input className={inputCls} value={b.invoice_footer ?? ''} onChange={e => set({ invoice_footer: e.target.value })} maxLength={500} />
          </Field>
        </fieldset>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        {canManage && (
          <div className="flex items-center gap-3">
            <Btn tone="brand" type="submit" disabled={busy}>{t('Save')}</Btn>
            {saved && <span className="text-sm font-semibold text-ok">{t('Saved')}</span>}
          </div>
        )}
      </form>
    </Card>
  );
}
