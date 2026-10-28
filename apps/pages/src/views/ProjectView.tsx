import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, HardHat, MapPin, MessageCircle } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadProjectPage, type DevUnitKind, type PublicUnit } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, t } from '../lib/i18n';
import { Link, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { Gallery } from '../components/Gallery';
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

  return (
    <Layout office={office} stickyBar>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <section className="night rise rounded-3xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><HardHat className="h-6 w-6" /></span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15">{t('New build')} · {projectStatus(p.status)}</span>
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold leading-snug sm:text-4xl">{p.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
            {place && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{place}</span>}
            {p.delivery_date && <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" />{t('Delivery {date}', { date: month(p.delivery_date) })}</span>}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:max-w-md">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"><p className="font-display tabular text-2xl font-bold">{p.available_units}</p><p className="text-xs text-white/70">{t('Units available')}</p></div>
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"><p className="font-display tabular text-2xl font-bold">{p.total_units}</p><p className="text-xs text-white/70">{t('Units in the project')}</p></div>
          </div>
        </section>

        {p.photos.length > 0 && <Gallery photos={p.photos} title={p.name} />}

        {p.description && (
          <section className="card rounded-2xl p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-semibold">{t('About the project')}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
          </section>
        )}

        {groups.length > 0 ? (
          <section className="card rounded-2xl p-4 sm:p-5">
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
      <ContactBar office={office} message={message} sticky />
    </Layout>
  );
}
