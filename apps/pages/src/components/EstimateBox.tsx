import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Home, KeyRound, Send } from 'lucide-react';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';
import { formatMad } from '@vastgoed/shared';
import { loadEstimate, submitEstimation, type EstimateRange } from '../lib/api';
import { typeLabel } from '../lib/format';
import { t } from '../lib/i18n';

const TYPES: PropertyType[] = ['apartment', 'villa', 'house', 'riad', 'land', 'shop', 'office'];
const CONDITIONS = ['new', 'good', 'to_refresh', 'to_renovate'] as const;
const conditionLabel = (c: typeof CONDITIONS[number]) => t(({ new: 'New or as new', good: 'Good condition', to_refresh: 'To refresh', to_renovate: 'To renovate' } as const)[c]);
const field = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15';
const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm font-semibold transition ${on ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'}`;

/** "Combien vaut mon bien ?": an owner gets a price range from the office's own properties, then leaves his number. */
export function EstimateBox({ slug, areas, initialArea = '' }: { slug: string; areas: string[]; initialArea?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [purpose, setPurpose] = useState<DealPurpose>('sale');
  const [type, setType] = useState<PropertyType>('apartment');
  const [hood, setHood] = useState(initialArea);
  const [area, setArea] = useState(90);
  const [beds, setBeds] = useState<number | null>(2);
  const [range, setRange] = useState<EstimateRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [condition, setCondition] = useState<typeof CONDITIONS[number] | null>(null);
  const [message, setMessage] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rent = purpose !== 'sale';

  // the range follows every change, a moment after the visitor stops moving the slider
  useEffect(() => {
    setLoading(true);
    const id = window.setTimeout(async () => {
      setRange(await loadEstimate(slug, purpose, type, hood, area));
      setLoading(false);
    }, 350);
    return () => window.clearTimeout(id);
  }, [slug, purpose, type, hood, area]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t('Please enter your name.')); return; }
    if (phone.replace(/\D/g, '').length < 8) { setError(t('Please enter a valid phone number.')); return; }
    setBusy(true); setError(null);
    const r = await submitEstimation({ slug, name: name.trim(), phone: phone.trim(), purpose, type, neighborhood: hood, area, bedrooms: beds, condition, message, trap });
    setBusy(false);
    if (r === 'ok') setStep(3);
    else setError(r === 'busy' ? t('Too many requests right now. Please try again in a moment, or contact us on WhatsApp.') : r === 'invalid' ? t('Please check your name and phone number.') : t('Sending failed. Check your connection and try again.'));
  };

  const hasRange = range && range.scope !== 'none' && range.low && range.high;
  const result = (
    <div className="night rounded-3xl p-6 text-center sm:p-8" aria-live="polite">
      <p className="text-sm font-semibold text-white/75">{rent ? t('Estimated rent') : t('Estimated value')}</p>
      {hasRange ? (
        <>
          <p className={`mt-2 flex flex-wrap items-baseline justify-center gap-x-2 font-display text-3xl font-bold leading-tight transition-opacity sm:text-4xl ${loading ? 'opacity-50' : ''}`}>
            <span className="tabular whitespace-nowrap">{formatMad(range!.low!)}</span>
            <span className="text-white/60">–</span>
            <span className="tabular whitespace-nowrap">{formatMad(range!.high!)}</span>
            {rent && <span className="w-full text-base font-semibold text-white/70">{t('/ month')}</span>}
          </p>
          <p className="mt-3 text-xs text-white/70">
            {range!.scope === 'neighborhood' && hood.trim()
              ? t('Based on {n} comparable properties of the agency in {area}.', { n: range!.count!, area: hood })
              : t('Based on {n} comparable properties of the agency.', { n: range!.count! })}
            {' '}{t('An agent confirms the real price after a visit.')}
          </p>
        </>
      ) : (
        <p className="mt-2 font-display text-xl font-bold">{loading ? '…' : t('An agent gives you a precise estimate, free of charge.')}</p>
      )}
    </div>
  );

  if (step === 3) {
    return (
      <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line/[0.08]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
        <p className="mt-3 font-display text-2xl font-bold">{t('Thank you, {name}', { name: name.trim().split(' ')[0] })}</p>
        <p className="mt-1 text-muted">{t('An agent calls you back today or tomorrow to confirm the estimate.')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 rounded-[2rem] bg-surface p-5 ring-1 ring-line/[0.08] sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
      {step === 1 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('You want to')}>
            {([['sale', t('Sell'), <Home key="h" className="h-5 w-5" />], ['rent_long', t('Rent out'), <KeyRound key="k" className="h-5 w-5" />]] as const).map(([p, label, icon]) => (
              <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)}
                className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold transition ${purpose === p ? 'gold-fill text-brand-ink' : 'bg-surface-2 text-muted hover:text-ink'}`}>{icon}{label}</button>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t('Type of property')}</p>
            <div className="flex flex-wrap gap-1.5">{TYPES.map(x => <button key={x} type="button" aria-pressed={type === x} onClick={() => setType(x)} className={chip(type === x)}>{typeLabel(x)}</button>)}</div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t('Neighborhood')}</p>
            {areas.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{areas.map(a => <button key={a} type="button" aria-pressed={hood === a} onClick={() => setHood(a)} className={chip(hood === a)}>{a}</button>)}</div>}
            <input className={field} value={hood} onChange={e => setHood(e.target.value)} placeholder={t('Your neighborhood')} maxLength={80} />
          </div>
          <div>
            <p className="mb-2 flex items-baseline justify-between text-sm font-semibold"><span>{t('Area')}</span><span className="tabular text-lg font-bold">{area} m²</span></p>
            <input type="range" min={20} max={type === 'villa' || type === 'land' ? 1500 : 400} step={5} value={area} onChange={e => setArea(Number(e.target.value))} className="w-full accent-brand" aria-label={t('Area')} />
          </div>
          {type !== 'land' && type !== 'shop' && type !== 'office' && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t('Bedrooms')}</p>
              <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-pressed={beds === n} onClick={() => setBeds(n)} className={chip(beds === n)}>{n === 5 ? '5+' : n}</button>)}</div>
            </div>
          )}
          <button type="button" onClick={() => setStep(2)} className="gold-fill inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-brand-ink">
            {t('Get my free estimate')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('Back')}</button>
          <p className="font-display text-xl font-bold">{t('Where can we reach you?')}</p>
          <p className="text-sm text-muted">{t('An agent confirms the estimate with you, without obligation.')}</p>
          <input className={field} value={name} onChange={e => setName(e.target.value)} placeholder={t('Your name')} autoComplete="name" maxLength={120} />
          <input className={field} dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('Phone or WhatsApp')} autoComplete="tel" />
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t('Condition')}</p>
            <div className="flex flex-wrap gap-1.5">{CONDITIONS.map(c => <button key={c} type="button" aria-pressed={condition === c} onClick={() => setCondition(condition === c ? null : c)} className={chip(condition === c)}>{conditionLabel(c)}</button>)}</div>
          </div>
          <textarea className={field} rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('Anything else? (optional)')} maxLength={1000} />
          <input tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} className="hidden" aria-hidden="true" />
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 text-sm font-bold text-bg disabled:opacity-50">
            <Send className="h-4 w-4" /> {busy ? '…' : t('Receive my estimate')}
          </button>
          <p className="text-xs text-muted">{t('Your details are only shared with this agency.')}</p>
        </form>
      )}
      {result}
    </div>
  );
}
