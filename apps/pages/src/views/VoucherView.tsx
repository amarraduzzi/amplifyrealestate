import { useEffect } from 'react';
import { FileSignature, MapPin, MessageCircle, Printer } from 'lucide-react';
import { loadVoucher } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, PORTAL_LANGS, t } from '../lib/i18n';
import { waLink } from '../lib/contact';
import { placeText, typeLabel } from '../lib/format';
import { Layout } from '../components/Layout';
import { Failed, Loading, NotFound } from './States';

/** The visitor's copy of a visit voucher: what he signed, when and with whom. Not indexed, link only. */
export function VoucherView({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadVoucher(token), token);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
    document.title = data ? `${t('Visit voucher')} · ${data.property.title}` : 'Amplify Real Estate';
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid.')} />;

  const { office, property: p } = data;
  const agent = office.agent_name || office.name;
  const when = new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.visited_at));
  const until = new Date(data.visited_at); until.setMonth(until.getMonth() + data.months);
  const untilText = new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'long' }).format(until);
  const place = placeText({ city: p.city, neighborhood: p.neighborhood });
  const wa = office.whatsapp ? waLink(office.whatsapp, t('Hello, about my visit of “{title}” ({ref}).', { title: p.title, ref: p.reference })) : null;

  return (
    <Layout office={office} langs={PORTAL_LANGS}>
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <article className="card rise overflow-hidden rounded-3xl">
          <header className="night flex items-center gap-3 p-5 sm:p-6">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FileSignature className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold sm:text-2xl">{t('Visit voucher')}</h1>
              <p className="text-sm text-white/75">{t('No. {n}', { n: data.number })} · {when}</p>
            </div>
          </header>

          <div className="space-y-5 p-5 sm:p-6">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('Property visited')}</p>
              <p className="mt-1 font-display text-lg font-bold">{p.title}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                <span>{typeLabel(p.property_type)}</span>
                {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{place}</span>}
                <span dir="ltr">{p.reference}</span>
              </p>
            </section>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-surface-2 p-3.5"><dt className="text-xs text-muted">{t('Visitor')}</dt><dd className="font-semibold">{data.visitor_name}</dd><dd className="tabular text-sm text-muted" dir="ltr">{data.visitor_phone}</dd></div>
              <div className="rounded-2xl bg-surface-2 p-3.5"><dt className="text-xs text-muted">{t('Through')}</dt><dd className="font-semibold">{agent}</dd>{office.agent_name && office.agent_name !== office.name && <dd className="text-sm text-muted">{office.name}</dd>}</div>
            </dl>

            <p className="rounded-2xl border border-line/[0.1] p-4 text-sm leading-relaxed">
              {t('I, {name}, confirm that I visited “{title}” today through {agent}. For {n} months I will not deal about this property directly with the owner or through someone else without {agent}.', {
                name: data.visitor_name, title: p.title, agent, n: data.months,
              })}
              <span className="mt-2 block text-xs text-muted">{t('Valid until {date}.', { date: untilText })}</span>
            </p>

            <figure>
              <figcaption className="mb-1 text-xs text-muted">{t('Signature of the visitor')}</figcaption>
              <img src={data.signature} alt={t('Signature of the visitor')} className="h-28 w-full rounded-2xl border border-line/[0.1] bg-white object-contain p-2" />
            </figure>
          </div>
        </article>

        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="gold-fill inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-brand-ink"><MessageCircle className="h-5 w-5" /> {t('Contact {name}', { name: agent })}</a>}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-3 text-sm font-bold"><Printer className="h-5 w-5" /> {t('Print')}</button>
        </div>
        <p className="mt-4 text-center text-xs text-muted">{t('Keep this link: it is your copy. The exact address of the property is shared by the agent.')}</p>
      </div>
    </Layout>
  );
}
