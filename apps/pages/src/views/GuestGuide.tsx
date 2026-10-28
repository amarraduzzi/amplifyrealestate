import { useEffect, useState, type ReactNode } from 'react';
import { Check, Clock, Copy, KeyRound, MapPin, ScrollText, Store, Wifi } from 'lucide-react';
import { loadGuestGuide } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { PORTAL_LANGS, t } from '../lib/i18n';
import { Link, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { Gallery } from '../components/Gallery';
import { Failed, Loading, NotFound } from './States';

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card rise rounded-3xl p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><span className="text-brand">{icon}</span> {title}</h2>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* no clipboard */ } }}
      className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-start">
      <span className="min-w-0"><span className="block text-xs text-muted">{label}</span><span className="tabular block truncate font-semibold" dir="ltr">{value}</span></span>
      {ok ? <Check className="h-4 w-4 shrink-0 text-ok" /> : <Copy className="h-4 w-4 shrink-0 text-muted" />}
    </button>
  );
}

/** What a guest sees behind the private link from the host: arrival, wifi, rules and good addresses. */
export function GuestGuide({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadGuestGuide(token), token);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? data.property.title : 'Amplify Real Estate';
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid. Ask your host for a new one.')} />;

  const { office, property: p, guide: g } = data;
  const place = [p.neighborhood, p.city].filter(Boolean).join(', ');
  const message = t('Hello, I am staying at “{title}”.', { title: p.title });

  return (
    <Layout office={office} stickyBar langs={PORTAL_LANGS}>
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold text-brand">{t('Welcome')}</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{p.title}</h1>
          {place && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin className="h-4 w-4" /> {place}</p>}
        </div>
        {p.photos.length > 0 && <Gallery photos={p.photos} title={p.title} />}
        {g.intro && <p className="whitespace-pre-line text-sm leading-relaxed">{g.intro}</p>}

        {(g.checkin_time || g.checkout_time) && (
          <div className="grid grid-cols-2 gap-2">
            {g.checkin_time && <div className="rounded-2xl bg-surface-2 p-3"><Clock className="h-4 w-4 text-brand" /><p className="font-display tabular mt-1 text-lg font-bold" dir="ltr">{g.checkin_time}</p><p className="text-xs text-muted">{t('Check-in from')}</p></div>}
            {g.checkout_time && <div className="rounded-2xl bg-surface-2 p-3"><Clock className="h-4 w-4 text-brand" /><p className="font-display tabular mt-1 text-lg font-bold" dir="ltr">{g.checkout_time}</p><p className="text-xs text-muted">{t('Check-out before')}</p></div>}
          </div>
        )}
        {g.arrival && <Block icon={<KeyRound className="h-5 w-5" />} title={t('How to arrive')}><p className="whitespace-pre-line">{g.arrival}</p></Block>}
        {(g.wifi_name || g.wifi_password) && (
          <Block icon={<Wifi className="h-5 w-5" />} title={t('Wifi')}>
            <div className="space-y-2">
              {g.wifi_name && <CopyRow label={t('Network')} value={g.wifi_name} />}
              {g.wifi_password && <CopyRow label={t('Password')} value={g.wifi_password} />}
            </div>
          </Block>
        )}
        {g.rules && <Block icon={<ScrollText className="h-5 w-5" />} title={t('House rules')}><p className="whitespace-pre-line">{g.rules}</p></Block>}
        {g.tips && <Block icon={<Store className="h-5 w-5" />} title={t('Good addresses nearby')}><p className="whitespace-pre-line">{g.tips}</p></Block>}

        <p className="text-center text-sm text-muted">
          {t('Need anything? Write to us on WhatsApp.')}{' '}
          <Link to={officePath(office.slug)} className="font-semibold text-brand hover:underline">{t('Our other properties')}</Link>
        </p>
      </div>
      <ContactBar office={office} message={message} sticky />
    </Layout>
  );
}
