import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadStayBooking, submitStayRequest, type StayBooking } from '../lib/api';
import { getLang, LOCALE, t } from '../lib/i18n';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const nightsOf = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const field = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15';

/** The same price as the database: Friday and Saturday nights at the weekend price, plus cleaning. */
export function quote(b: StayBooking, a: string, z: string) {
  let nightsCents = 0;
  for (let d = a; d < z; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 5 = Friday, 6 = Saturday
    nightsCents += (dow === 5 || dow === 6) && b.weekend_price_cents ? b.weekend_price_cents : b.price_cents;
  }
  return { nightsCents, total: nightsCents + b.cleaning_cents };
}

function Month({ start, busy, from, to, onPick }: { start: string; busy: (d: string) => boolean; from: string; to: string; onPick: (d: string) => void }) {
  const endMode = !!from && !to;
  const first = new Date(`${start}T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const days = nightsOf(start, iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1))));
  const today = iso(new Date());
  const names = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(LOCALE[getLang()], { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  return (
    <div>
      <p className="mb-2 text-center text-sm font-semibold capitalize">{new Intl.DateTimeFormat(LOCALE[getLang()], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs" dir="ltr">
        {names.map((n, i) => <span key={i} className="py-1 font-semibold text-muted">{n}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = addDays(start, i);
          const off = d < today || (busy(d) && !(endMode && d > from));
          const inRange = from && to && d >= from && d < to;
          const edge = d === from || d === to;
          return (
            <button key={d} type="button" disabled={off} onClick={() => onPick(d)}
              className={`h-9 rounded-lg tabular transition ${edge ? 'bg-ink font-bold text-bg' : inRange ? 'bg-brand/15 font-semibold' : off ? 'text-muted/40 line-through' : 'hover:bg-surface-2'}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Free dates, the right price at once, and a complete request: the guest knows everything, the host reads one message. */
export function BookingBox({ slug, reference, onBook, onReady }: { slug: string; reference: string; onBook: (token: string) => void; onReady?: (on: boolean) => void }) {
  const [b, setB] = useState<StayBooking | null | undefined>(undefined);
  const [month, setMonth] = useState(() => { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 24 ? 1 : 0), 1))); });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [f, setF] = useState({ name: '', phone: '', guests: '2', arrival: '', message: '', offer: '', rules: false, trap: '' });
  const [offerOn, setOfferOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadStayBooking(slug, reference).then(x => { setB(x); onReady?.(!!x); }); }, [slug, reference]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBusy = useMemo(() => (d: string) => !!b?.busy.some(x => d >= x.start && d < x.end), [b]);
  if (!b) return null;
  const n = from && to ? nightsOf(from, to) : 0;
  const q = n > 0 ? quote(b, from, to) : null;
  const offerCents = offerOn && f.offer ? Math.round(Number(f.offer.replace(/\s/g, '').replace(',', '.')) * 100) : null;
  const minOffer = q && b.min_offer_pct ? Math.ceil(q.total * b.min_offer_pct / 100) : null;
  const total = q ? (offerCents && offerCents < q.total ? offerCents : q.total) : 0;
  const nextMonth = (k: number) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return iso(d); };

  const pick = (d: string) => {
    setError(null);
    if (!from || (from && to) || d <= from) { if (isBusy(d)) return; setFrom(d); setTo(''); return; }
    // the range may not cross a busy night
    for (let x = from; x < d; x = addDays(x, 1)) if (isBusy(x)) { setError(t('These dates are not all free. Choose other dates.')); return; }
    if (nightsOf(from, d) < b.min_nights) { setError(t('Minimum {n} nights.', { n: b.min_nights })); return; }
    setTo(d);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q) { setError(t('Choose your arrival and departure date in the calendar.')); return; }
    if (f.name.trim().length < 2) { setError(t('Please enter your name.')); return; }
    const digits = f.phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) { setError(t('Please enter a valid phone number.')); return; }
    if (b.max_guests && Number(f.guests) > b.max_guests) { setError(t('At most {n} guests.', { n: b.max_guests })); return; }
    if (offerCents && minOffer && offerCents < minOffer) { setError(t('Your offer is too low. The minimum is {amount}.', { amount: formatMad(minOffer) })); return; }
    if (!f.rules) { setError(t('Please accept the house rules.')); return; }
    setBusy(true); setError(null);
    const r = await submitStayRequest({ slug, reference, name: f.name.trim(), phone: f.phone.trim(), guests: Math.max(1, Number(f.guests) || 1), checkIn: from, checkOut: to,
      arrival: f.arrival, message: f.message, offerCents: offerCents && offerCents < q.total ? offerCents : null, rulesOk: f.rules, lang: getLang(), trap: f.trap });
    setBusy(false);
    if ('token' in r) { onBook(r.token); return; }
    const M: Record<string, string> = {
      request_taken: t('These dates were just booked. Choose other dates.'), request_min_nights: t('Minimum {n} nights.', { n: b.min_nights }),
      request_too_many: t('At most {n} guests.', { n: b.max_guests ?? 0 }), request_offer_low: t('Your offer is too low.'), request_busy: t('Too many requests right now. Please try again in a moment, or contact us on WhatsApp.'),
      request_duplicate: t('You already sent a request a few minutes ago.'), request_rules: t('Please accept the house rules.'),
    };
    setError(M[r.error] ?? t('Sending failed. Check your connection and try again.'));
  };

  return (
    <section className="card rounded-2xl p-4 sm:p-5" id="reserver">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarDays className="h-5 w-5 text-brand" /> {t('Check availability and book')}</h2>
      <p className="mt-0.5 text-sm text-muted">{t('Tap your arrival day, then your departure day. Crossed-out days are taken.')}</p>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(nextMonth(-1))} disabled={month <= iso(new Date()).slice(0, 8) + '01'} aria-label={t('Previous month')} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
        <button type="button" onClick={() => setMonth(nextMonth(1))} aria-label={t('Next month')} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
      </div>
      <div className="mt-1 grid gap-4 sm:grid-cols-2">
        <Month start={month} busy={isBusy} from={from} to={to} onPick={pick} />
        <div className="hidden sm:block"><Month start={nextMonth(1)} busy={isBusy} from={from} to={to} onPick={pick} /></div>
      </div>

      {q && (
        <div className="mt-4 space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="flex justify-between"><span>{n === 1 ? t('1 night') : t('{n} nights', { n })}</span><span className="tabular">{formatMad(q.nightsCents)}</span></p>
          {b.cleaning_cents > 0 && <p className="flex justify-between text-muted"><span>{t('Cleaning')}</span><span className="tabular">{formatMad(b.cleaning_cents)}</span></p>}
          {offerCents && offerCents < q.total && <p className="flex justify-between text-muted"><span>{t('Your offer')}</span><span className="tabular">{formatMad(offerCents)}</span></p>}
          <p className="flex justify-between border-t border-line/10 pt-1 font-bold"><span>{t('Total')}</span><span className="tabular">{formatMad(total)}</span></p>
          {b.advance_pct > 0 && <p className="flex justify-between text-xs text-muted"><span>{t('Deposit to confirm ({pct}%)', { pct: Number(b.advance_pct) })}</span><span className="tabular">{formatMad(Math.round(total * b.advance_pct / 100))}</span></p>}
          {b.deposit_cents > 0 && <p className="flex justify-between text-xs text-muted"><span>{t('Security deposit, given back after the stay')}</span><span className="tabular">{formatMad(b.deposit_cents)}</span></p>}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 space-y-2.5" noValidate>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input className={field} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t('Your name')} aria-label={t('Your name')} autoComplete="name" maxLength={120} />
          <input className={field} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={t('Your WhatsApp number')} aria-label={t('Your WhatsApp number')} inputMode="tel" dir="ltr" maxLength={40} />
          <input className={field} value={f.guests} onChange={e => setF({ ...f, guests: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" aria-label={t('Number of guests')} placeholder={t('Number of guests')} />
          <input className={field} value={f.arrival} onChange={e => setF({ ...f, arrival: e.target.value })} placeholder={t('Arrival time (approx.)')} aria-label={t('Arrival time (approx.)')} maxLength={20} />
        </div>
        <textarea className={field} rows={2} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder={t('A question or a wish (optional)')} maxLength={1000} />
        {b.min_offer_pct && q && (
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={offerOn} onChange={e => setOfferOn(e.target.checked)} /> {t('Make an offer')}</label>
            {offerOn && <>
              <input className={`${field} mt-2`} inputMode="decimal" value={f.offer} onChange={e => setF({ ...f, offer: e.target.value })} placeholder={t('Your price for the whole stay (DH)')} dir="ltr" />
              <p className="mt-1 text-xs text-muted">{t('The host answers your offer quickly. Offers from {amount}.', { amount: formatMad(minOffer ?? 0) })}</p>
            </>}
          </div>
        )}
        {(b.rules || b.checkin_from || b.checkout_until) && (
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            {(b.checkin_from || b.checkout_until) && <p className="text-muted">{[b.checkin_from ? t('Check-in from {time}', { time: b.checkin_from }) : null, b.checkout_until ? t('Check-out before {time}', { time: b.checkout_until }) : null].filter(Boolean).join(' · ')}</p>}
            {b.rules && <p className="mt-1 whitespace-pre-line">{b.rules}</p>}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.rules} onChange={e => setF({ ...f, rules: e.target.checked })} /> {t('I accept the house rules.')}</label>
        <input type="text" tabIndex={-1} autoComplete="off" value={f.trap} onChange={e => setF({ ...f, trap: e.target.value })} aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" name="website" />
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-bg transition hover:opacity-90 disabled:opacity-50">
          {busy ? '…' : t('Send my request')}
        </button>
        <p className="flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-ok" /> {t('Free request. You pay nothing until the host accepts. Your details only go to this host.')}</p>
      </form>
    </section>
  );
}
