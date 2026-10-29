import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, HardHat, MapPin, MessageCircle, Phone } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadProjectPage, type DevUnitKind, type PublicUnit } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, t } from '../lib/i18n';
import { Link, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { PhotoMosaic } from '../components/PhotoHero';
import { logEvent } from '../lib/api';
import { telLink, waLink } from '../lib/contact';
import { InquiryForm } from '../components/InquiryForm';
import { Failed, Loading, NotFound } from './States';

export const unitKind = (k: DevUnitKind) => t(({ apartment: 'Apartment', villa: 'Villa', duplex: 'Duplex', studio: 'Studio', shop: 'Shop', office: 'Office space', parking: 'Parking', storage: 'Storage', plot: 'Plot', other: 'Other' } as const)[k]);
export const projectStatus = (s: 'planning' | 'selling' | 'construction' | 'delivered') => t(({ planning: 'Coming soon', selling: 'On sale', construction: 'Under construction', delivered: 'Delivered' } as const)[s]);
const month = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const floorText = (f: number | null) => (f === null ? '' : f === 0 ? t('Ground floor') : f < 0 ? t('Basement {n}', { n: -f }) : t('Floor {n}', { n: f }));
const unitLabel = (u: PublicUnit) => [u.reference, unitKind(u.kind), u.bedrooms ? t('{n} bedrooms', { n: u.bedrooms }) : null, u.area_m2 ? `${Number(u.area_m2)} m²` : null].filter(Boolean).join(' · ');

/** A new-build project: photos, what is still available by type, the list of units and a call-back form. */
export function ProjectView({ slug, project }: { slug: string; project: string }) {
  const [state, retry] = useFetch(() => loadProjectPage(slug, project), `${slug}/${project}`);
  const data = state.status === 'ready' ? state.data : null;
  const [kind, setKind] = useState<string>('all');
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { document.title = data ? `${data.project.name} · ${data.office.name}` : 'Amplify Real Estate'; }, [data]);

  // Available units grouped: "Apartment, 2 bedrooms: 6 units from 950 000 DH, 72 to 85 m²"
  const groups = useMemo(() => {
    const m = new Map<string, { kind: DevUnitKind; bedrooms: number | null; n: number; price: number | null; amin: number | null; amax: number | null }>();
    for (const u of data?.units ?? []) {
      const k = `${u.kind}:${u.bedrooms ?? ''}`;
      const g = m.get(k) ?? { kind: u.kind, bedrooms: u.bedrooms, n: 0, price: null, amin: null, amax: null };
      g.n += 1;
      if (u.price_cents !== null) g.price = g.price === null ? u.price_cents : Math.min(g.price, u.price_cents);
      if (u.area_m2 !== null) { const a = Number(u.area_m2); g.amin = g.amin === null ? a : Math.min(g.amin, a); g.amax = g.amax === null ? a : Math.max(g.amax, a); }
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || (a[1].bedrooms ?? 0) - (b[1].bedrooms ?? 0));
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This project is no longer online, or the link is not correct.')} />;

  const { office, project: p, units } = data;
  const shown = units.filter(u => kind === 'all' || `${u.kind}:${u.bedrooms ?? ''}` === kind);
  const link = window.location.origin + window.location.pathname;
  const message = t('Hello, I am interested in the project “{name}”. {url}', { name: p.name, url: link });
  const place = [p.address, p.city].filter(Boolean).join(', ');

  const prices = units.map(u => u.price_cents).filter((x): x is number => x !== null);
  const from = prices.length ? Math.min(...prices) : null;
  const toUnits = () => document.getElementById('lots')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const facts = [
    { n: p.available_units, label: t('Units available') },
    { n: p.total_units, label: t('Units in the project') },
  ];

  const card = (
    <div className="card rounded-3xl p-5">
      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{t('New build')} · {projectStatus(p.status)}</span>
      {from !== null
        ? <p className="mt-3"><span className="block text-sm text-muted">{t('Starting from')}</span><span className="font-display tabular text-3xl font-bold">{formatMad(from)}</span></p>
        : <p className="mt-3 text-sm text-muted">{t('Prices on request: leave your number and we will send you the price list.')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {facts.map(x => <div key={x.label} className="rounded-2xl bg-surface-2 p-3"><p className="font-display tabular text-xl font-bold">{x.n}</p><p className="text-xs text-muted">{x.label}</p></div>)}
      </div>
      {p.delivery_date && <p className="mt-3 flex items-center gap-1.5 text-sm"><CalendarClock className="h-4 w-4 text-brand" />{t('Delivery {date}', { date: month(p.delivery_date) })}</p>}
      <div className="mt-4 space-y-2">
        {groups.length > 0 && <button type="button" onClick={toUnits} className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-bg transition hover:opacity-90">{t('Choose a unit')}</button>}
        {office.whatsapp && (
          <a href={waLink(office.whatsapp, message)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
            className="gold-fill flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105">
            <MessageCircle className="h-5 w-5" /> {t('Contact on WhatsApp')}
          </a>
        )}
        {office.phone && (
          <a href={telLink(office.phone)} onClick={() => logEvent(office.slug, null, 'call')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-3 text-sm font-bold transition hover:bg-surface-2">
            <Phone className="h-5 w-5" /> {t('Call')}
          </a>
        )}
      </div>
      <p className="mt-4 border-t border-line/[0.07] pt-3 text-xs text-muted">{office.name}{office.city ? ` · ${office.city}` : ''}</p>
    </div>
  );

  return (
    <Layout office={office} stickyBar wide>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4">
          <p className="text-sm text-muted">
            <Link to={officePath(office.slug)} className="font-semibold text-brand hover:underline">{office.name}</Link> · {t('New build')}{place ? ` · ${place}` : ''}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight sm:text-4xl">{p.name}</h1>
        </div>
        <PhotoMosaic photos={p.photos} title={p.name} icon={<HardHat className="h-10 w-10 text-white/85" />} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            {/* on a phone the key figures come first, under the photos */}
            <div className="lg:hidden">
              <p className="flex flex-wrap items-baseline gap-x-2">
                {from !== null && <><span className="text-sm text-muted">{t('Starting from')}</span><span className="font-display tabular text-3xl font-bold">{formatMad(from)}</span></>}
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{projectStatus(p.status)}</span>
              </p>
            </div>

            <section aria-label={t('Details')} className="flex flex-wrap gap-x-6 gap-y-3 border-y border-line/[0.08] py-4">
              <div className="flex items-center gap-2.5"><Building2 className="h-5 w-5 text-brand" /><span><span className="block font-semibold leading-tight tabular">{p.available_units} / {p.total_units}</span><span className="block text-xs text-muted">{t('Units available')}</span></span></div>
              {p.delivery_date && <div className="flex items-center gap-2.5"><CalendarClock className="h-5 w-5 text-brand" /><span><span className="block font-semibold leading-tight">{month(p.delivery_date)}</span><span className="block text-xs text-muted">{t('Delivery')}</span></span></div>}
              {place && <div className="flex items-center gap-2.5"><MapPin className="h-5 w-5 text-brand" /><span className="font-semibold">{place}</span></div>}
            </section>

            {p.description && (
              <section>
                <h2 className="mb-2 font-display text-lg font-bold">{t('About the project')}</h2>
                <p className="whitespace-pre-line leading-relaxed">{p.description}</p>
              </section>
            )}

        {groups.length > 0 ? (
          <section id="lots" className="scroll-mt-4">
            <h2 className="font-display text-lg font-bold">{t('Available now')}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {groups.map(([k, g]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? 'all' : k)}
                  className={`rounded-2xl p-3 text-start transition ${kind === k ? 'bg-ink text-bg' : 'bg-surface-2 hover:ring-2 hover:ring-brand/25'}`}>
                  <p className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 opacity-70" />{unitKind(g.kind)}{g.bedrooms ? ` · ${t('{n} bedrooms', { n: g.bedrooms })}` : ''}</p>
                  <p className={`mt-0.5 text-sm ${kind === k ? 'text-bg/80' : 'text-muted'}`}>
                    {t('{n} available', { n: g.n })}{g.amin !== null ? ` · ${g.amin === g.amax ? `${g.amin} m²` : `${g.amin} – ${g.amax} m²`}` : ''}
                  </p>
                  {g.price !== null && <p className="font-display tabular mt-1 font-bold">{t('from {price}', { price: formatMad(g.price) })}</p>}
                </button>
              ))}
            </div>
            <ul className="mt-4 divide-y divide-line/[0.07] text-sm">
              {shown.map(u => (
                <li key={u.reference} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="font-semibold" dir="ltr">{u.reference}</span> <span className="text-muted">· {unitKind(u.kind)}{u.bedrooms ? ` · ${t('{n} bedrooms', { n: u.bedrooms })}` : ''}</span>
                    <span className="block text-xs text-muted">{[floorText(u.floor), u.area_m2 ? `${Number(u.area_m2)} m²` : null, u.terrace_m2 ? t('terrace {n} m²', { n: Number(u.terrace_m2) }) : null].filter(Boolean).join(' · ')}</span></span>
                  <span className="flex items-center gap-2">
                    {u.price_cents !== null && <span className="tabular font-semibold">{formatMad(u.price_cents)}</span>}
                    <a href="#rappel" onClick={() => setPick(u.reference)} className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{t('I am interested')}</a>
                  </span>
                </li>
              ))}
            </ul>
            {!p.show_prices && <p className="mt-3 text-xs text-muted">{t('Prices on request: leave your number and we will send you the price list.')}</p>}
          </section>
        ) : (
          <p className="card rounded-2xl p-5 text-sm text-muted">{t('All units of this project are reserved or sold. Leave your number to hear about the next project.')}</p>
        )}

        <div id="rappel" className="scroll-mt-4">
          <InquiryForm slug={office.slug} reference={null} project={p.slug} units={units.map(u => ({ reference: u.reference, label: unitLabel(u) }))} unit={pick} />
        </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={officePath(office.slug)} className="text-sm font-semibold text-brand hover:underline">{t('More from {office}', { office: office.name })}</Link>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${p.name}\n${link}`)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2">
                <MessageCircle className="h-4 w-4" />{t('Share on WhatsApp')}
              </a>
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-6 lg:block">{card}</aside>
        </div>
      </div>
      <div className="lg:hidden"><ContactBar office={office} message={message} sticky /></div>
    </Layout>
  );
}
