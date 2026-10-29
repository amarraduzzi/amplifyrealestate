import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, CheckCircle2, MessageCircle } from 'lucide-react';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';
import { submitAlert } from '../lib/api';
import { purposeLabel, typeLabel } from '../lib/format';
import { getLang, t } from '../lib/i18n';
import { short, type Filters } from './ListingFilters';

const field = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15';
const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`;

/** "Be the first to know": the visitor keeps the current search and gets new matching properties on WhatsApp. */
export function AlertBox({ slug, purposes, purpose, type, filters, hoods, hood: initialHood, strong }: {
  slug: string; purposes: DealPurpose[]; purpose: DealPurpose | null; type: PropertyType | null; filters: Filters;
  hoods: string[]; hood: string | null; strong?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deal, setDeal] = useState<DealPurpose>(purpose ?? purposes[0] ?? 'sale');
  const [hood, setHood] = useState(initialHood ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (purpose) setDeal(purpose); }, [purpose]);
  useEffect(() => { setHood(initialHood ?? ''); }, [initialHood]);

  // the budget belongs to one kind of deal; when the visitor picks another one here, it is left out
  const budgetFits = purpose !== null && purpose === deal;
  const per = deal === 'rent_long' ? ` ${t('/ month')}` : deal === 'rent_short' ? ` ${t('/ night')}` : '';
  const budget = !budgetFits ? null
    : filters.min !== null && filters.max !== null ? `${short(filters.min)} - ${short(filters.max)}${per}`
    : filters.max !== null ? t('up to {price}', { price: short(filters.max) }) + per
    : filters.min !== null ? t('from {price}', { price: short(filters.min) }) + per : null;
  const summary = [
    purposeLabel(deal), type ? typeLabel(type) : null, hood || null, budget,
    filters.beds > 0 ? t('{n}+ bedrooms', { n: filters.beds }) : null, filters.area > 0 ? t('From {n} m²', { n: filters.area }) : null,
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'busy') return;
    if (name.trim().length < 2) { setError(t('Please enter your name.')); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) { setError(t('Please enter a valid phone number.')); return; }
    setState('busy'); setError(null);
    const lang = getLang();
    const r = await submitAlert({
      slug, name: name.trim(), phone: phone.trim(), purpose: deal, type, neighborhood: hood || null,
      min: budgetFits ? filters.min : null, max: budgetFits ? filters.max : null, beds: filters.beds, area: filters.area,
      lang: lang === 'ar' || lang === 'en' ? lang : 'fr', trap,
    });
    if (r === 'ok') { setState('done'); return; }
    setState('idle');
    setError(r === 'invalid' ? t('Please check your name and phone number.') : r === 'busy' ? t('Too many requests right now. Please try again in a moment, or contact us on WhatsApp.') : t('Sending failed. Check your connection and try again.'));
  };

  if (state === 'done') {
    return (
      <div className="mt-10 flex items-start gap-3 rounded-3xl bg-surface p-5 ring-1 ring-line/10 sm:p-6">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
        <div>
          <p className="font-display text-lg font-bold">{t('Your alert is on')}</p>
          <p className="mt-1 text-sm text-muted">{t('As soon as a property matches your search, we send it to you on WhatsApp.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-10 overflow-hidden rounded-3xl ring-1 ${strong ? 'bg-brand/[0.07] ring-brand/25' : 'bg-surface ring-line/10'}`}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-white"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold sm:text-xl">{strong ? t('Nothing yet? We will look for you.') : t('Be the first to know')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('Get the new properties that match your search on WhatsApp, before they are everywhere.')}</p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95">
            <MessageCircle className="h-4 w-4" /> {t('Create my alert')}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="border-t border-line/10 p-5 sm:p-6" noValidate>
          {purposes.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t('I want to')}>
              {purposes.map(p => <button key={p} type="button" aria-pressed={deal === p} onClick={() => setDeal(p)} className={chip(deal === p)}>{purposeLabel(p)}</button>)}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Your name')} aria-label={t('Your name')} autoComplete="name" className={field} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('WhatsApp number')} aria-label={t('WhatsApp number')} inputMode="tel" autoComplete="tel" className={field} />
            {hoods.length > 0 ? (
              <select value={hood} onChange={e => setHood(e.target.value)} aria-label={t('Neighborhood')} className={field}>
                <option value="">{t('All neighborhoods')}</option>
                {hoods.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            ) : <span className="hidden sm:block" />}
          </div>
          <input value={trap} onChange={e => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" aria-label={t('Your search')}>
              {summary.map(s => <span key={s} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-line/10">{s}</span>)}
            </div>
            <button type="submit" disabled={state === 'busy'} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-bg transition hover:opacity-90 disabled:opacity-50">
              <BellRing className="h-4 w-4" /> {state === 'busy' ? t('Sending…') : t('Turn on my alert')}
            </button>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
          <p className="mt-3 text-xs text-muted">{t('Free. You can stop at any time by replying STOP.')}</p>
        </form>
      )}
    </div>
  );
}
