import { useEffect, type ReactNode } from 'react';
import { CalendarCheck, CalendarClock, Eye, Handshake, Heart, KeyRound, MapPin, MessageCircle, Wrench } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadOwnerPortal, photoUrl, type PortalProperty } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { placeText, priceSuffix, purposeLabel, statusCls, statusLabel } from '../lib/format';
import { getLang, LOCALE, PORTAL_LANGS, t } from '../lib/i18n';
import { Link, propertyPath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { PropertyIcon } from '../components/PropertyIcon';
import { Failed, Loading, NotFound } from './States';

const SITE_NAMES: Record<string, string> = { mubawab: 'Mubawab', avito: 'Avito', sarouty: 'Sarouty', facebook: 'Facebook', instagram: 'Instagram', other: t('Other') };
const day = (d: string, style: 'medium' | 'long' = 'medium') => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: style, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const month = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);

function Tile({ icon, n, label }: { icon: ReactNode; n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <span className="text-brand">{icon}</span>
      <p className="font-display tabular mt-1 text-xl font-bold">{n}</p>
      <p className="text-xs leading-tight text-muted">{label}</p>
    </div>
  );
}

function PropertyBlock({ p, slug }: { p: PortalProperty; slug: string }) {
  const place = placeText(p);
  const lease = p.lease;
  const paid = lease?.payments.filter(x => x.status === 'paid').reduce((s, x) => s + x.amount_cents, 0) ?? 0;
  const open = lease?.payments.filter(x => x.status === 'due' && x.due_date < today()).reduce((s, x) => s + x.amount_cents, 0) ?? 0;
  const repairCost = p.repairs.filter(r => r.cost_borne_by === 'owner').reduce((s, r) => s + (r.cost_cents ?? 0), 0);
  const onOffer = p.status === 'available' || p.status === 'reserved';

  return (
    <section className="card rise overflow-hidden rounded-3xl">
      <div className="flex gap-4 p-4 sm:p-5">
        {p.cover
          ? <img src={photoUrl(p.cover, true)} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-surface-3 object-cover sm:h-24 sm:w-24" />
          : <span className="night grid h-20 w-20 shrink-0 place-items-center rounded-2xl sm:h-24 sm:w-24"><PropertyIcon type={p.property_type} className="h-8 w-8 text-white/90" /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{purposeLabel(p.purpose)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>
            {p.online && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-bold text-ok">{t('Online')}</span>}
          </div>
          <h2 className="font-display mt-1.5 text-lg font-bold leading-snug">{p.title}</h2>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-display tabular font-bold">{formatMad(p.price_cents)}</span><span className="text-xs text-muted">{priceSuffix(p.purpose)}</span>
          </p>
          {place && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5" />{place} · <span dir="ltr">{p.reference}</span></p>}
        </div>
      </div>

      {onOffer && (
        <div className="border-t border-line/[0.07] p-4 sm:p-5">
          <h3 className="text-sm font-semibold">{t('Activity')}</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Tile icon={<CalendarCheck className="h-4 w-4" />} n={p.viewings_done} label={t('Viewings held')} />
            <Tile icon={<CalendarClock className="h-4 w-4" />} n={p.viewings_planned} label={t('Viewings planned')} />
            <Tile icon={<Heart className="h-4 w-4" />} n={p.interested} label={t('Interested')} />
            <Tile icon={<Handshake className="h-4 w-4" />} n={p.offers} label={t('Offers')} />
            <Tile icon={<Eye className="h-4 w-4" />} n={p.page_views} label={t('Page visits')} />
            <Tile icon={<MessageCircle className="h-4 w-4" />} n={p.contacts} label={t('Contact requests')} />
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted">
            {p.sites.length > 0 && <p>{t('Advertised on: {sites}', { sites: p.sites.map(s => SITE_NAMES[s] ?? s).join(', ') })}</p>}
            {p.mandate_until && <p>{t('Mandate valid until {date}', { date: day(p.mandate_until) })}</p>}
            {p.online && <p><Link to={propertyPath(slug, p.reference)} className="font-semibold text-brand hover:underline">{t('See the page as buyers see it')}</Link></p>}
          </div>
        </div>
      )}

      {lease && (
        <div className="border-t border-line/[0.07] p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-brand" /> {t('Rental')}</h3>
          <p className="mt-1 text-sm">{t('Tenant')}: <span className="font-semibold">{lease.tenant}</span> · <span className="tabular">{formatMad(lease.rent_cents)}</span> {t('/ month')}</p>
          <p className="text-xs text-muted">{t('Since {date}', { date: day(lease.start_date) })}{lease.end_date ? ` · ${t('until {date}', { date: day(lease.end_date) })}` : ''}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-ok/10 p-3"><p className="font-display tabular text-lg font-bold text-ok">{formatMad(paid)}</p><p className="text-xs text-muted">{t('Rent received (12 months)')}</p></div>
            <div className={`rounded-2xl p-3 ${open ? 'bg-danger/10' : 'bg-surface-2'}`}><p className={`font-display tabular text-lg font-bold ${open ? 'text-danger' : ''}`}>{formatMad(open)}</p><p className="text-xs text-muted">{t('Overdue rent')}</p></div>
          </div>
          {lease.payments.length > 0 && (
            <ul className="mt-3 divide-y divide-line/[0.07] text-sm">
              {lease.payments.map(x => {
                const late = x.status === 'due' && x.due_date < today();
                return (
                  <li key={x.due_date} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="capitalize">{month(x.due_date)}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatMad(x.amount_cents)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${x.status === 'paid' ? 'bg-ok/10 text-ok' : late ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-muted'}`}>
                        {x.status === 'paid' ? t('Paid') : late ? t('Late') : t('To be paid')}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {p.repairs.length > 0 && (
        <div className="border-t border-line/[0.07] p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-brand" /> {t('Repairs (12 months)')}</h3>
          {repairCost > 0 && <p className="mt-1 text-xs text-muted">{t('Paid by you: {amount}', { amount: formatMad(repairCost) })}</p>}
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.repairs.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <span className="min-w-0"><span className="block font-semibold">{r.title}</span><span className="text-xs text-muted">{day(r.reported_on)}</span></span>
                <span className="shrink-0 text-end text-xs">
                  <span className={`block font-bold ${r.status === 'done' ? 'text-ok' : 'text-warn'}`}>{r.status === 'done' ? t('Done') : r.status === 'in_progress' ? t('In progress') : t('Reported')}</span>
                  {r.cost_cents != null && <span className="tabular block text-muted">{formatMad(r.cost_cents)}{r.cost_borne_by ? ` · ${r.cost_borne_by === 'owner' ? t('you') : r.cost_borne_by === 'tenant' ? t('tenant') : t('agency')}` : ''}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** What an owner sees behind the personal link the office sent: all their properties, activity, rent and repairs. */
export function OwnerPortal({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadOwnerPortal(token), token);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${data.owner.name} · ${data.office.name}` : 'Amplify Real Estate';
    // A private page: never in search engines
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid. Ask your agency for a new one.')} />;

  const { office, owner, properties } = data;
  const first = owner.name.trim().split(/\s+/)[0] ?? '';
  const message = t('Hello, this is {name}, owner of {title}.', { name: owner.name, title: properties[0]?.title ?? '' });
  return (
    <Layout office={office} stickyBar langs={PORTAL_LANGS}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Hello {name}', { name: first })}</h1>
          <p className="mt-1 text-sm text-muted">{t('Your properties with {office}. Updated {date}.', { office: office.name, date: day(data.generated_at.slice(0, 10), 'long') })}</p>
        </div>
        {properties.length === 0 && <p className="card rounded-2xl p-5 text-sm text-muted">{t('No properties to show right now.')}</p>}
        {properties.map(p => <PropertyBlock key={p.reference} p={p} slug={office.slug} />)}
        <p className="text-center text-xs text-muted">{t('This page is personal. Do not share the link.')}</p>
      </div>
      <ContactBar office={office} message={message} sticky />
    </Layout>
  );
}
