import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Copy, KeyRound, MessageCircle, XCircle } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { guestStayRequest, loadStayRequest } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, PORTAL_LANGS, t } from '../lib/i18n';
import { waLink } from '../lib/contact';
import { Layout } from '../components/Layout';
import { Failed, Loading, NotFound } from './States';

const day = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const time = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

/** The guest follows the request: sent, accepted with payment details, paid, confirmed with the guest page. */
export function RequestView({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadStayRequest(token), token);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
    document.title = data ? data.property.title : 'Amplify Real Estate';
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid.')} />;

  const { office, property: p, request: r, status } = data;
  const phone = data.contact;
  const link = window.location.origin + window.location.pathname;
  const summary = t('Hello, I just sent a booking request for {title}: {a} to {b}, {n} guests, {amount}. {url}', {
    title: p.title, a: day(r.check_in), b: day(r.check_out), n: r.guests, amount: formatMad(r.total_cents), url: link });
  const act = async (a: 'paid' | 'accept_counter' | 'cancel') => {
    if (a === 'cancel' && !window.confirm(t('Cancel your request?'))) return;
    setBusy(true); await guestStayRequest(token, a); setBusy(false); retry();
  };
  const wa = (text: string) => (phone ? `${waLink(phone)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`);
  const head = {
    new: { icon: <Clock className="h-7 w-7 text-brand" />, title: t('Request sent'), text: t('The host checks your request and answers you here and on WhatsApp.') },
    counter: { icon: <MessageCircle className="h-7 w-7 text-warn" />, title: t('The host proposes something else'), text: t('Look at the proposal below.') },
    accepted: { icon: <CheckCircle2 className="h-7 w-7 text-ok" />, title: t('Accepted: the dates are kept for you'), text: r.hold_until ? t('Pay the deposit before {time} to confirm.', { time: time(r.hold_until) }) : '' },
    paid_claimed: { icon: <Clock className="h-7 w-7 text-brand" />, title: t('Payment reported'), text: t('The host checks your payment and confirms.') },
    confirmed: { icon: <CheckCircle2 className="h-7 w-7 text-ok" />, title: t('Booking confirmed'), text: t('See you soon! Everything for your arrival is on your guest page.') },
    declined: { icon: <XCircle className="h-7 w-7 text-danger" />, title: t('Not available'), text: t('The host cannot accept this request. Try other dates.') },
    expired: { icon: <XCircle className="h-7 w-7 text-muted" />, title: t('The option has expired'), text: t('The deposit was not reported in time. Contact the host if you still want to come.') },
    cancelled: { icon: <XCircle className="h-7 w-7 text-muted" />, title: t('Request cancelled'), text: '' },
  }[status];

  return (
    <Layout office={office} langs={PORTAL_LANGS}>
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-5 sm:py-8">
        <section className="card rounded-2xl p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2">{head.icon}</span>
          <h1 className="font-display mt-3 text-xl font-bold">{head.title}</h1>
          {head.text && <p className="mt-1 text-sm text-muted">{head.text}</p>}
        </section>

        <section className="card rounded-2xl p-4 text-sm">
          <p className="font-semibold">{p.title}{p.city ? ` · ${p.city}` : ''}</p>
          <p className="mt-1">{day(r.check_in)} → {day(r.check_out)} · {r.nights === 1 ? t('1 night') : t('{n} nights', { n: r.nights })} · {t('{n} guests', { n: r.guests })}</p>
          <div className="mt-3 space-y-1 border-t border-line/10 pt-2">
            {r.offer_cents && <p className="flex justify-between text-muted"><span>{t('Price')}</span><span className="tabular line-through">{formatMad(r.quote_cents)}</span></p>}
            <p className="flex justify-between font-bold"><span>{t('Total')}</span><span className="tabular">{formatMad(r.total_cents)}</span></p>
            {r.advance_cents > 0 && <p className="flex justify-between text-muted"><span>{t('Deposit to confirm')}</span><span className="tabular">{formatMad(r.advance_cents)}</span></p>}
            {r.deposit_cents > 0 && <p className="flex justify-between text-muted"><span>{t('Security deposit, given back after the stay')}</span><span className="tabular">{formatMad(r.deposit_cents)}</span></p>}
          </div>
          {r.host_note && <p className="mt-3 rounded-xl bg-surface-2 p-3"><span className="font-semibold">{t('Message from the host')}:</span> {r.host_note}</p>}
        </section>

        {status === 'new' && (
          <a href={wa(summary)} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ok px-4 py-3.5 font-bold text-white shadow-lg">
            <MessageCircle className="h-5 w-5" /> {t('Also send it to the host on WhatsApp')}
          </a>
        )}
        {status === 'counter' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => act('accept_counter')} className="flex-1 rounded-2xl bg-ok px-4 py-3 font-bold text-white">{t('Accept the proposal')}</button>
            <button type="button" disabled={busy} onClick={() => act('cancel')} className="rounded-2xl bg-surface-2 px-4 py-3 font-semibold">{t('No thanks')}</button>
          </div>
        )}
        {status === 'accepted' && (
          <section className="card rounded-2xl p-4 text-sm">
            <h2 className="font-semibold">{t('How to pay the deposit')}</h2>
            {data.payment_info ? (
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(data.payment_info!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}
                className="mt-2 flex w-full items-start justify-between gap-2 rounded-xl bg-surface-2 p-3 text-start">
                <span className="whitespace-pre-line">{data.payment_info}</span>{copied ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : <Copy className="h-4 w-4 shrink-0 text-muted" />}
              </button>
            ) : <p className="mt-1 text-muted">{t('The host will send you the payment details on WhatsApp.')}</p>}
            <p className="mt-3 text-muted">{t('After paying: send a photo of the receipt on WhatsApp, then tap "I have paid".')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={wa(t('Hello, here is the receipt of my deposit for {title} ({a} to {b}).', { title: p.title, a: day(r.check_in), b: day(r.check_out) }))} target="_blank" rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 font-semibold"><MessageCircle className="h-4 w-4 text-ok" /> {t('Send the receipt')}</a>
              <button type="button" disabled={busy} onClick={() => act('paid')} className="flex-1 rounded-xl bg-ok px-4 py-3 font-bold text-white">{t('I have paid')}</button>
            </div>
          </section>
        )}
        {status === 'confirmed' && data.guide_token && (
          <a href={`/g/${data.guide_token}?lang=${getLang()}`} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3.5 font-bold text-bg"><KeyRound className="h-5 w-5" /> {t('Open my guest page')}</a>
        )}
        {(status === 'new' || status === 'accepted') && <button type="button" disabled={busy} onClick={() => act('cancel')} className="w-full text-center text-sm font-semibold text-muted">{t('Cancel my request')}</button>}
        {phone && status !== 'new' && <a href={wa('')} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-sm font-semibold text-ok"><MessageCircle className="h-4 w-4" /> {t('Questions? WhatsApp the host')}</a>}
        <p className="text-center text-xs text-muted">{t('Keep this link: it always shows the latest status of your request.')}</p>
      </div>
    </Layout>
  );
}
