import { useEffect, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadOffice, logEvent, photoUrl } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { t } from '../lib/i18n';
import { Link, areaPath, areaSlug, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { PropertyCard } from '../components/PropertyCard';
import { EstimateBox } from '../components/EstimateBox';
import { ContactBar } from '../components/ContactBar';
import { splitAreas } from './EstimationView';
import { TileMap } from '../components/TileMap';
import { themeName } from '../lib/theme';
import { Failed, Loading, NotFound } from './States';

/** "Immobilier à Agdal": a page per neighborhood, filled with the office's own properties there. Good for Google. */
export function AreaView({ slug, area }: { slug: string; area: string }) {
  const [state, retry] = useFetch(() => loadOffice(slug), slug);
  const data = state.status === 'ready' ? state.data : null;
  const areas = useMemo(() => splitAreas(data?.site?.areas), [data]);
  const inArea = useMemo(() => (data?.listings ?? []).filter(l => l.neighborhood && areaSlug(l.neighborhood) === area), [data, area]);
  const name = areas.find(a => areaSlug(a) === area) ?? inArea[0]?.neighborhood ?? area.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  useEffect(() => { document.title = data ? `${t('Real estate in {area}', { area: name })} · ${data.office.name}` : 'Amplify Real Estate'; }, [data, name]);
  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;
  const { office, site } = data;
  const sale = inArea.filter(l => l.purpose === 'sale' && l.price_cents && l.area_m2);
  const perM2 = sale.length ? Math.round(sale.reduce((a, l) => a + (l.price_cents as number) / Number(l.area_m2), 0) / sale.length / 10000) * 10000 : null;
  const rents = inArea.filter(l => l.purpose === 'rent_long' && l.price_cents);
  const rentFrom = rents.length ? Math.min(...rents.map(l => l.price_cents as number)) : null;
  const img = inArea.find(l => l.cover)?.cover ?? site?.hero ?? null;
  const point = Object.entries(site?.points ?? {}).find(([k]) => areaSlug(k) === area)?.[1] ?? null;
  const hello = t('Hello, I am looking for a property in {area}.', { area: name });
  const stats = [
    { v: String(inArea.length), label: t('Properties available') },
    ...(perM2 ? [{ v: formatMad(perM2), label: t('Average price per m² (for sale)') }] : []),
    ...(rentFrom ? [{ v: formatMad(rentFrom), label: t('Rent from, per month') }] : []),
  ];

  return (
    <Layout office={office} stickyBar wide brand={office.style} flush site={office}>
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-night">
          {img && <img src={photoUrl(img)} alt="" className="slowzoom h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-black/50" />
        </div>
        <div className="mx-auto flex min-h-[52svh] w-full max-w-6xl flex-col justify-end px-4 pb-20 pt-14 text-white sm:px-6">
          <p className="text-sm font-semibold text-white/80"><Link to={officePath(office.slug)} className="hover:underline">{office.name}</Link> · {t('Neighborhood')}</p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-6xl">{t('Real estate in {area}', { area: name })}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{t('{office} knows {area} street by street. Here are our properties in the neighborhood, and what your own property is worth.', { office: office.name, area: name })}</p>
        </div>
      </section>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className={`relative z-10 -mt-10 grid gap-px overflow-hidden rounded-3xl bg-line/10 shadow-xl ring-1 ring-line/[0.08] ${stats.length === 3 ? 'sm:grid-cols-3' : stats.length === 2 ? 'grid-cols-2' : ''}`}>
          {stats.map(s => <div key={s.label} className="bg-surface p-5 text-center"><p className="font-display tabular text-2xl font-bold text-brand sm:text-3xl">{s.v}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p></div>)}
        </div>

        {point && (
          <div className="pt-10">
            <TileMap height={300} dark={themeName(office.style) === 'noir'} points={[{ id: name, lat: point[0], lng: point[1], label: name }]} />
          </div>
        )}
        <section className="py-14">
          <h2 className="font-display text-3xl font-bold">{t('Our properties in {area}', { area: name })}</h2>
          {inArea.length === 0
            ? <p className="mt-4 text-muted">{t('No property online in {area} right now. Leave your number and we will call you as soon as something comes in.', { area: name })}</p>
            : <ul className="mt-6 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">{inArea.map(p => <li key={p.reference}><PropertyCard slug={office.slug} p={p} /></li>)}</ul>}
        </section>

        <section className="pb-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{t('Owner in {area}?', { area: name })}</p>
          <h2 className="mb-6 mt-1 font-display text-3xl font-bold">{t('How much is my property worth?')}</h2>
          <EstimateBox slug={office.slug} areas={areas} initialArea={name} />
        </section>

        {areas.filter(a => areaSlug(a) !== area).length > 0 && (
          <section className="pb-16">
            <h2 className="font-display text-xl font-bold">{t('Other neighborhoods')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.filter(a => areaSlug(a) !== area).map(a => (
                <Link key={a} to={areaPath(office.slug, a)} className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold ring-1 ring-line/10 hover:text-brand"><MapPin className="h-4 w-4" />{a}</Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <ContactBar office={office} message={hello} sticky />
    </Layout>
  );
}
