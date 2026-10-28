import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Inbox, MessageCircle, Tag } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { StayProp } from '../lib/stays';
import { adTexts, answerMessage, loadRequests, requestError, type RequestStatus, type StayRates, type StayRequest } from '../lib/stayRequests';
import { PUBLIC_SITE, propertyUrl } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { waLink } from './ContactLinks';
import { Btn, Card, Field, Modal, inputCls } from './ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const when = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const err = (m: string) => { const x = requestError(m); return x ? t(x) : planError(m); };
const dh = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? dirhamToCents(v) : null; };
const toDh = (c: number | null | undefined) => (c ? String(c / 100) : '');
const STATUS: Record<RequestStatus, string> = {
  new: 'New request', accepted: 'Accepted, waiting for deposit', paid_claimed: 'Guest says paid', confirmed: 'Confirmed',
  declined: 'Declined', counter: 'Proposal sent', expired: 'Option expired', cancelled: 'Cancelled by guest',
};
const open = (phone: string, text: string) => window.open(`${waLink(phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');

/** Prices, request settings and the ready Facebook texts of one short-term rental. */
function RatesModal({ office, prop, onClose }: { office: Office; prop: StayProp; onClose: () => void }) {
  const [r, setR] = useState<StayRates | null | undefined>(undefined);
  const [f, setF] = useState({ weekend: '', cleaning: '', deposit: '', advance: '30', minNights: '1', maxGuests: '', offers: false, minOffer: '85', payment: '', hold: '24', on: true });
  const [extra, setExtra] = useState<{ city: string | null; bedrooms: number | null }>({ city: null, bedrooms: null });
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase.from('stay_rates').select('*').eq('property_id', prop.id).maybeSingle().then(({ data, error }) => {
      if (error) { setR(null); return; }
      const x = data as StayRates | null; setR(x ?? undefined);
      if (x) setF({ weekend: toDh(x.weekend_price_cents), cleaning: toDh(x.cleaning_cents), deposit: toDh(x.deposit_cents), advance: String(Number(x.advance_pct)), minNights: String(x.min_nights),
        maxGuests: x.max_guests ? String(x.max_guests) : '', offers: x.min_offer_pct !== null, minOffer: x.min_offer_pct ? String(Number(x.min_offer_pct)) : '85', payment: x.payment_info ?? '', hold: String(x.hold_hours), on: x.requests_on });
    });
    supabase.from('properties').select('city, bedrooms').eq('id', prop.id).maybeSingle().then(({ data }) => data && setExtra(data as { city: string | null; bedrooms: number | null }));
  }, [prop.id]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const row = {
      weekend_price_cents: dh(f.weekend), cleaning_cents: dh(f.cleaning) ?? 0, deposit_cents: dh(f.deposit) ?? 0, advance_pct: Math.min(100, Math.max(0, Number(f.advance) || 0)),
      min_nights: Math.min(60, Math.max(1, Number(f.minNights) || 1)), max_guests: f.maxGuests ? Math.min(50, Math.max(1, Number(f.maxGuests))) : null,
      min_offer_pct: f.offers ? Math.min(100, Math.max(50, Number(f.minOffer) || 85)) : null, payment_info: f.payment.trim() || null, hold_hours: Math.min(72, Math.max(2, Number(f.hold) || 24)), requests_on: f.on,
    };
    const res = r ? await supabase.from('stay_rates').update(row).eq('property_id', prop.id).select('property_id') : await supabase.from('stay_rates').insert({ ...row, property_id: prop.id, org_id: office.id }).select('property_id');
    if (res.error) { setError(err(res.error.message)); return; }
    setError(null); setR({ ...(row as unknown as StayRates), property_id: prop.id, org_id: office.id }); setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const link = PUBLIC_SITE ? `${propertyUrl(office.slug, prop.reference, lang)}#reserver` : '';
  const texts = adTexts({ title: prop.title, city: extra.city, nightCents: prop.price_cents, weekendCents: dh(f.weekend), bedrooms: extra.bedrooms, link, office: office.name, lang });
  const copy = async (k: string, s: string) => { try { await navigator.clipboard.writeText(s); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* */ } };
  if (r === null) return <Modal title={prop.title} onClose={onClose}><p className="text-sm text-warn">{t('Run the SQL of etappe 12c first.')}</p></Modal>;
  return (
    <Modal title={`${prop.title} · ${t('Prices and requests')}`} onClose={onClose} footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Close')}</Btn><Btn tone="brand" type="submit" form="rates-form">{saved ? <Check className="h-4 w-4" /> : null}{saved ? t('Saved') : t('Save')}</Btn></div>}>
      <form id="rates-form" onSubmit={save} className="space-y-3">
        <p className="text-sm text-muted">{t('Price per night: {amount} (set in the property). Guests see the free dates and the exact price on the property page, and send a complete request.', { amount: prop.price_cents ? formatMad(prop.price_cents) : '—' })}</p>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.on} onChange={e => setF({ ...f, on: e.target.checked })} /> {t('Accept booking requests on the property page')}</label>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Weekend night (DH)')} hint={t('Friday and Saturday')}><input className={inputCls} inputMode="decimal" value={f.weekend} onChange={e => setF({ ...f, weekend: e.target.value })} /></Field>
          <Field label={t('Cleaning (DH)')}><input className={inputCls} inputMode="decimal" value={f.cleaning} onChange={e => setF({ ...f, cleaning: e.target.value })} /></Field>
          <Field label={t('Security deposit (DH)')}><input className={inputCls} inputMode="decimal" value={f.deposit} onChange={e => setF({ ...f, deposit: e.target.value })} /></Field>
          <Field label={t('Deposit to confirm (%)')}><input className={inputCls} inputMode="numeric" value={f.advance} onChange={e => setF({ ...f, advance: e.target.value })} /></Field>
          <Field label={t('Minimum nights')}><input className={inputCls} inputMode="numeric" value={f.minNights} onChange={e => setF({ ...f, minNights: e.target.value })} /></Field>
          <Field label={t('Maximum guests')}><input className={inputCls} inputMode="numeric" value={f.maxGuests} onChange={e => setF({ ...f, maxGuests: e.target.value })} /></Field>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.offers} onChange={e => setF({ ...f, offers: e.target.checked })} /> {t('Guests may make an offer')}</label>
          {f.offers && <div className="mt-2 flex items-center gap-2 text-sm"><span>{t('Lowest offer')}</span><input className={`${inputCls} w-20`} inputMode="numeric" value={f.minOffer} onChange={e => setF({ ...f, minOffer: e.target.value })} /><span>{t('% of the price')}</span></div>}
          <p className="mt-1 text-xs text-muted">{t('Negotiating without the endless messages: the guest sees the lowest price you accept, and you answer the offer with one tap.')}</p>
        </div>
        <Field label={t('Payment details for the deposit')} hint={t('Shown to the guest only after you accept.')}>
          <textarea className={inputCls} rows={3} value={f.payment} onChange={e => setF({ ...f, payment: e.target.value })} maxLength={1000} placeholder={t('For example: RIB CIH 230 810 ..., name ... or CashPlus / Wafacash to the name of ..., 06 ...')} />
        </Field>
        <Field label={t('Option kept for (hours)')}><input className={`${inputCls} w-24`} inputMode="numeric" value={f.hold} onChange={e => setF({ ...f, hold: e.target.value })} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
      {link && (
        <section className="mt-5 space-y-2 border-t border-line/10 pt-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t('Facebook and WhatsApp')}</h3>
            <span className="flex gap-1">{(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{l}</button>)}</span></div>
          {([['post', t('Text for the post or Marketplace'), texts.post], ['reply', t('Automatic answer (Messenger: Automated responses > Instant reply. WhatsApp Business: Greeting message and Quick replies)'), texts.reply], ['link', t('The booking link'), link]] as const).map(([k, label, txt]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className="mt-1 whitespace-pre-line break-words text-sm" dir={lang === 'ar' && k !== 'link' ? 'rtl' : 'ltr'}>{txt}</p>
              <button type="button" onClick={() => copy(k, txt)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand">{copied === k ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === k ? t('Copied') : t('Copy')}</button>
            </div>
          ))}
          <p className="text-xs text-muted">{t('Tip: Marketplace does not always make links clickable. Put the link in the automatic answer, in your WhatsApp status and on your profile.')}</p>
        </section>
      )}
    </Modal>
  );
}

/** Booking requests from the property pages: accept, decline, propose something else, confirm the deposit. */
export function StayRequests({ office, props, onChanged }: { office: Office; props: StayProp[]; onChanged: () => void }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<StayRequest[] | null>(null);
  const [rates, setRates] = useState<StayProp | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => setRows(await loadRequests(office.id)), [office.id]);
  useEffect(() => { load(); }, [load]);
  if (rows === null) return null;

  const title = (r: StayRequest) => props.find(p => p.id === r.property_id)?.title ?? '';
  const hold = async (r: StayRequest) => (await supabase.from('stay_rates').select('hold_hours').eq('property_id', r.property_id).maybeSingle()).data?.hold_hours ?? 24;
  const answer = async (r: StayRequest, action: 'accept' | 'decline' | 'counter' | 'confirm') => {
    let args: Record<string, unknown> = { p_id: r.id, p_action: action };
    if (action === 'counter') {
      const dates = window.prompt(t('Other dates? Arrival and departure as YYYY-MM-DD YYYY-MM-DD (leave empty to keep the dates)'), `${r.check_in} ${r.check_out}`);
      if (dates === null) return;
      const price = window.prompt(t('Your price for the whole stay (DH), empty = the normal price'), String(r.total_cents / 100));
      if (price === null) return;
      const note = window.prompt(t('A short message for the guest (optional)')) ?? '';
      const [a, b] = dates.trim().split(/\s+/);
      args = { ...args, p_in: a && b && (a !== r.check_in || b !== r.check_out) ? a : null, p_out: a && b && (a !== r.check_in || b !== r.check_out) ? b : null, p_total_cents: dh(price), p_note: note || null };
    }
    if (action === 'decline') { const note = window.prompt(t('A short message for the guest (optional)')); if (note === null) return; args.p_note = note || null; }
    if (action === 'confirm' && !window.confirm(t('Did you receive the deposit of {amount}? The booking is then confirmed.', { amount: formatMad(r.advance_cents) }))) return;
    const { error } = await supabase.rpc('answer_stay_request', args);
    if (error) { setError(err(error.message)); return; }
    setError(null);
    const fresh = (await supabase.from('stay_requests').select('*').eq('id', r.id).single()).data as StayRequest | null;
    open(r.guest_phone, answerMessage(action, fresh ?? r, title(r), office.name, await hold(r)));
    load(); onChanged();
  };
  const active = rows.filter(r => ['new', 'accepted', 'paid_claimed', 'counter'].includes(r.status));
  const shown = showAll ? rows : active;

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Inbox className="h-4 w-4 text-brand" /> {t('Booking requests')} {active.length > 0 && <span className="rounded-full bg-brand px-2 text-xs text-white">{active.length}</span>}</h2>
        <span className="flex flex-wrap gap-1.5">
          {canWrite && props.map(p => <button key={p.id} type="button" onClick={() => setRates(p)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold"><Tag className="h-3.5 w-3.5" /> {p.title}</button>)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{t('Guests choose free dates on the property page and see the exact price. Tap a property above to set prices, the deposit and the texts for Facebook.')}</p>
      {shown.length === 0 && <p className="mt-3 text-sm text-muted">{t('No open requests.')}</p>}
      <ul className="mt-3 space-y-2">
        {shown.map(r => (
          <li key={r.id} className={`rounded-2xl bg-surface-2 px-3.5 py-3 text-sm ${['declined', 'cancelled', 'expired'].includes(r.status) ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span><span className="font-semibold">{r.guest_name}</span> <span className="text-xs text-muted">· {title(r)}</span>
                <span className="block text-xs text-muted">{day(r.check_in)} → {day(r.check_out)} · {r.nights} {t('nights')} · {r.guests} {t('guests')}{r.arrival_time ? ` · ${t('arrival {time}', { time: r.arrival_time })}` : ''} · {r.lang.toUpperCase()}</span></span>
              <span className="text-end"><span className="tabular block font-bold">{formatMad(r.total_cents)}</span>
                {r.offer_cents && <span className="block text-xs font-semibold text-warn">{t('offer, price {amount}', { amount: formatMad(r.quote_cents) })}</span>}
                <span className="block text-xs text-muted">{t(STATUS[r.status])}{r.status === 'accepted' && r.hold_until ? ` · ${t('until {time}', { time: when(r.hold_until) })}` : ''}</span></span>
            </div>
            {r.message && <p className="mt-1 text-xs">“{r.message}”</p>}
            {canWrite && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(r.status === 'new' || r.status === 'counter' || r.status === 'expired') && <Btn tone="brand" onClick={() => answer(r, 'accept')}>{t('Accept')}</Btn>}
                {(r.status === 'accepted' || r.status === 'paid_claimed') && <Btn tone="brand" onClick={() => answer(r, 'confirm')}><Check className="h-4 w-4" /> {t('Deposit received')}</Btn>}
                {(r.status === 'new' || r.status === 'expired') && <Btn tone="ghost" onClick={() => answer(r, 'counter')}>{t('Propose something else')}</Btn>}
                {!['confirmed', 'declined', 'cancelled'].includes(r.status) && <Btn tone="ghost" onClick={() => answer(r, 'decline')}>{t('Decline')}</Btn>}
                <Btn tone="ghost" onClick={() => open(r.guest_phone, '')}><MessageCircle className="h-4 w-4" /> WhatsApp</Btn>
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows.length > active.length && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-xs font-semibold text-muted">{showAll ? t('Only open requests') : t('Show all requests of the last 30 days')}</button>}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rates && <RatesModal office={office} prop={rates} onClose={() => setRates(null)} />}
    </Card>
  );
}
