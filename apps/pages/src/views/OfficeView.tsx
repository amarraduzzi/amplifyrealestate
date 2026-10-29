import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, HardHat, Heart, LayoutGrid, Map as MapIcon, Mail, MapPin, MessageCircle, Phone, Quote, Search, Star, UserRound } from 'lucide-react';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';
import { formatMad } from '@vastgoed/shared';
import { loadOffice, loadOfficeProjects, logEvent, photoUrl, type ProjectCard, type SiteBlock } from '../lib/api';
import { Link, areaPath, areaSlug, blogPath, estimationPath, navigate, projectPath, propertyPath } from '../lib/router';
import { TileMap } from '../components/TileMap';
import { PostCardView } from './BlogView';
import { themeName } from '../lib/theme';
import { rememberSite, SECTION_EVENT, takePending } from '../components/SiteHeader';
import { EstimateBox } from '../components/EstimateBox';
import { projectStatus } from './ProjectView';
import { useFetch } from '../lib/useFetch';
import { priceSuffix, purposeLabel, typeLabel } from '../lib/format';
import { t } from '../lib/i18n';
import { telLink, waLink } from '../lib/contact';
import { Layout } from '../components/Layout';
import { langLabel } from '../lib/vitrine';
import { ContactBar } from '../components/ContactBar';
import { PropertyCard } from '../components/PropertyCard';
import { AlertBox } from '../components/AlertBox';
import { ListingMap } from '../components/ListingMap';
import { ParallaxImg } from '../components/Parallax';
import { FavButton } from '../components/FavButton';
import { HeroBackdrop, HeroSearch, heroSlides } from '../components/HeroSlides';
import { readFavs, selectionUrl, sharedSelection, useFavs } from '../lib/favorites';
import { ListingFilters, NO_FILTERS, applyFilters, type Filters } from '../components/ListingFilters';
import { InquiryForm } from '../components/InquiryForm';
import { Failed, Loading, NotFound } from './States';

const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
const SITE_NAME = { avito: 'Avito', mubawab: 'Mubawab', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' } as const;
const DEFAULT_BLOCKS: SiteBlock[] = ['hero', 'listings', 'about', 'team', 'reviews', 'areas', 'estimate', 'contact'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Fades a section in when it scrolls into view. */
function Reveal({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { el.classList.add('shown'); return; }
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <section ref={ref} id={id} className={`reveal scroll-mt-24 ${className}`}>{children}</section>;
}

/** A number that counts up once it is on screen. */
function CountUp({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { setV(n); return; }
    let raf = 0;
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => { const p = Math.min(1, (now - t0) / 1100); setV(Math.round(n * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [n]);
  return <span ref={ref} className="tabular">{v}</span>;
}

const Heading = ({ kicker, title }: { kicker?: string; title: string }) => (
  <div className="mb-6">
    {kicker && <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{kicker}</p>}
    <h2 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h2>
  </div>
);

/** The office website (Amplify Vitrine): the blocks the office chose, in its own style. */
export function OfficeView({ slug }: { slug: string }) {
  const [state, retry] = useFetch(() => loadOffice(slug), slug);
  const [purpose, setPurpose] = useState<DealPurpose | 'all'>('all');
  const [type, setType] = useState<PropertyType | 'all'>('all');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const favs = useFavs(slug);
  const [favOnly, setFavOnly] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [shared, setShared] = useState<string[] | null>(() => sharedSelection());
  useEffect(() => { setPurpose('all'); setType('all'); setQ(''); setFilters(NO_FILTERS); setFavOnly(false); }, [slug]);

  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${data.office.name}${data.site?.tagline ? ` · ${data.site.tagline}` : ''}` : 'Amplify Real Estate';
  }, [data]);
  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);
  // the menu in the header: open a section, with a filter for Buy and Rent
  useEffect(() => {
    if (!data) return;
    rememberSite(data.office.slug, { blog: (data.site?.posts ?? []).length > 0, areas: (data.site?.areas ?? '').trim().length > 0 });
    const open = (section: string, p?: DealPurpose, fav?: boolean) => {
      if (fav) { setFavOnly(readFavs(data.office.slug).length > 0); setShared(null); }
      else if (section === 'biens') setFavOnly(false);
      if (p) {
        const has = (x: DealPurpose) => data.listings.some(l => l.purpose === x);
        // "Rent": long-term first, else short stays, else everything
        setPurpose(has(p) ? p : p === 'rent_long' && has('rent_short') ? 'rent_short' : 'all'); setType('all'); setQ(''); setFilters(f => ({ ...f, min: null, max: null }));
      }
      window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    const first = takePending();
    if (first) open(first.section, first.purpose, first.favs);
    const on = (e: Event) => { const d = (e as CustomEvent<{ section: string; purpose?: DealPurpose; favs?: boolean }>).detail; open(d.section, d.purpose, d.favs); };
    window.addEventListener(SECTION_EVENT, on);
    return () => window.removeEventListener(SECTION_EVENT, on);
  }, [data]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  useEffect(() => { loadOfficeProjects(slug).then(setProjects); }, [slug]);

  const present = useMemo(() => PURPOSES.filter(p => data?.listings.some(l => l.purpose === p)), [data]);
  const types = useMemo(() => Array.from(new Set((data?.listings ?? []).map(l => l.property_type))), [data]);
  const hoods = useMemo(() => Array.from(new Set((data?.listings ?? []).map(l => l.neighborhood).filter((x): x is string => !!x))).sort(), [data]);
  const hoodFromQ = useMemo(() => { const n = norm(q.trim()); return n ? hoods.find(h => norm(h) === n || norm(h).includes(n)) ?? null : null; }, [q, hoods]);
  // the budget only makes sense for one kind of deal: the chosen one, or the only one the office has
  const dealFor = purpose !== 'all' ? purpose : present.length === 1 ? present[0] : null;
  const shown = useMemo(() => {
    const n = norm(q.trim());
    const base = (data?.listings ?? []).filter(l => (purpose === 'all' || l.purpose === purpose) && (type === 'all' || l.property_type === type)
      && (!n || norm([l.title, l.neighborhood, l.city, l.reference].filter(Boolean).join(' ')).includes(n)));
    return applyFilters(base, filters, dealFor !== null);
  }, [data, purpose, type, q, filters, dealFor]);
  // a shared selection or "my favorites" replaces the search: exactly those properties, in that order
  const picked = shared ?? (favOnly ? favs : null);
  const pickedList = useMemo(() => picked === null ? null
    : picked.map(r => (data?.listings ?? []).find(l => l.reference === r)).filter((x): x is NonNullable<typeof x> => !!x), [picked, data]);
  useEffect(() => { if (favOnly && favs.length === 0) setFavOnly(false); }, [favOnly, favs.length]);
  useEffect(() => { if (shared) window.setTimeout(() => document.getElementById('biens')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400); }, [shared, data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;

  const { office, listings } = data;
  const viewToggle = (
    <span className="inline-flex rounded-xl bg-surface p-1 ring-1 ring-line/10" role="group" aria-label={t('View')}>
      {([['list', t('List'), <LayoutGrid key="l" className="h-4 w-4" />], ['map', t('Map'), <MapIcon key="m" className="h-4 w-4" />]] as const).map(([k, label, icon]) => (
        <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === k ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>
          {icon}{label}
        </button>
      ))}
    </span>
  );
  const showAll = () => {
    setFavOnly(false);
    if (shared) {
      setShared(null);
      const u = new URL(window.location.href); u.searchParams.delete('selection'); window.history.replaceState(null, '', u);
    }
  };
  const shareText = [t('My selection at {office}:', { office: office.name }), '',
    ...(pickedList ?? []).map(l => `• ${l.title} · ${formatMad(l.price_cents)}`), '', selectionUrl(office.slug, (pickedList ?? []).map(l => l.reference))].join('\n');
  const site = data.site;
  const services = (site?.services ?? '').split('\n').map(s => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
  const areas = (site?.areas ?? '').split(/[,·\n]/).map(s => s.trim()).filter(Boolean);
  const team = site?.team ?? [];
  const reviews = site?.reviews ?? [];
  const hello = t('Hello, I would like information about your properties.');
  const forSale = listings.filter(l => l.purpose === 'sale').length;
  const forRent = listings.length - forSale;
  const solo = office.edition === 'agent' && !!office.agent;
  const name = solo ? office.agent!.name : office.name;
  const profiles = (['avito', 'mubawab', 'facebook', 'instagram', 'tiktok'] as const)
    .map(k => [k, office.links?.[k]] as const).filter((x): x is readonly [typeof x[0], string] => !!x[1] && /^https:\/\//.test(x[1]));
  // listings are always on the page; the hero is first when it is on
  const chosen = (site?.blocks?.length ? site.blocks : DEFAULT_BLOCKS);
  const blocks: SiteBlock[] = [...chosen.filter(b => b !== 'hero'), ...(chosen.includes('listings') ? [] : ['listings' as SiteBlock])];
  const heroOn = chosen.includes('hero');
  const slides = heroSlides(site?.hero, listings);
  const posts = site?.posts ?? [];
  const pts = site?.points ?? {};
  const mapPoints = areas.filter(a => Array.isArray(pts[a])).map(a => {
    const n = listings.filter(l => l.neighborhood && areaSlug(l.neighborhood) === areaSlug(a)).length;
    return { id: a, lat: pts[a][0], lng: pts[a][1], label: <>{a}{n > 0 && <span className="rounded-full bg-white/25 px-1.5">{n}</span>}</>, onClick: () => navigate(areaPath(office.slug, a)) };
  });
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;

  const figures = [
    { n: listings.length, label: t('Properties online') },
    { n: forSale, label: t('For sale') },
    { n: forRent, label: t('For rent') },
    ...(site && site.done > 0 ? [{ n: site.done, label: t('Sold or rented') }] : []),
  ];

  const waBtn = office.whatsapp && (
    <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
      className="gold-fill inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105">
      <MessageCircle className="h-4 w-4" />{t('Contact on WhatsApp')}
    </a>
  );

  const star = site?.featured ? listings.find(l => l.reference === site.featured!.reference) ?? null : null;
  const starPics = star ? (star.photos?.length ? star.photos : star.cover ? [star.cover] : []) : [];
  const sections: Record<SiteBlock, ReactNode> = {
    hero: null,
    featured: star ? (
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-night text-white shadow-2xl">
          {starPics[0] && <ParallaxImg src={photoUrl(starPics[0])} className="absolute inset-0 -z-10 h-full w-full object-cover" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/40 lg:bg-gradient-to-r lg:from-black/80 lg:via-black/40 lg:to-transparent" />
          <div className="grid min-h-[34rem] gap-8 p-6 sm:p-10 lg:min-h-[38rem] lg:grid-cols-[1.15fr_1fr] lg:items-end lg:p-14">
            <div className="flex flex-col justify-end">
              <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] ring-1 ring-white/25 backdrop-blur-md">
                <Heart className="h-3.5 w-3.5 fill-current text-rose-400" /> {t('Our favorite')}
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">{star.title}</h2>
              {(star.neighborhood || star.city) && <p className="mt-3 flex items-center gap-1.5 text-white/80"><MapPin className="h-4 w-4" />{[star.neighborhood, star.city].filter(Boolean).join(', ')}</p>}
              {site?.featured?.excerpt && <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{site.featured.excerpt}{site.featured.excerpt.length >= 240 ? '…' : ''}</p>}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to={propertyPath(office.slug, star.reference)} className="gold-fill inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-brand-ink transition hover:brightness-105">
                  {t('Discover this property')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
                <span className="relative block h-10 w-10 [&>button]:!static [&>button]:!h-10 [&>button]:!w-10"><FavButton slug={office.slug} reference={star.reference} /></span>
              </div>
            </div>
            <div className="flex flex-col gap-4 lg:items-end">
              <div className="grid w-full max-w-md grid-cols-3 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
                {[
                  star.area_m2 !== null ? { n: Number(star.area_m2), label: 'm²' } : null,
                  star.bedrooms !== null && star.bedrooms > 0 ? { n: star.bedrooms, label: t('Bedrooms') } : null,
                  star.bathrooms !== null && star.bathrooms > 0 ? { n: star.bathrooms, label: t('Bathrooms') } : null,
                ].filter((x): x is { n: number; label: string } => !!x).map(x => (
                  <div key={x.label} className="border-e border-white/15 p-4 text-center last:border-e-0">
                    <p className="font-display text-3xl font-bold"><CountUp n={x.n} /></p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">{x.label}</p>
                  </div>
                ))}
              </div>
              <p className="w-full max-w-md rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/20 backdrop-blur-md">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/70">{purposeLabel(star.purpose)}</span>
                <span className="font-display tabular text-3xl font-bold">{formatMad(star.price_cents)}</span>
                <span className="ms-1.5 text-sm text-white/70">{priceSuffix(star.purpose)}</span>
              </p>
              {starPics.length > 1 && (
                <div className="hidden w-full max-w-md grid-cols-3 gap-2 lg:grid">
                  {starPics.slice(1, 4).map(ph => (
                    <Link key={ph} to={propertyPath(office.slug, star.reference)} className="block overflow-hidden rounded-xl ring-1 ring-white/25">
                      <img src={photoUrl(ph, true)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 hover:scale-105" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    ) : null,
    listings: (
      <Reveal id="biens">
        <Heading kicker={t('Our selection')} title={t('Available properties')} />
        {pickedList !== null && (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/10 sm:flex-row sm:items-center sm:p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-500"><Heart className="h-5 w-5 fill-current" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{shared ? t('A selection shared with you') : t('My favorites')}</p>
              <p className="text-sm text-muted">{shared ? t('{n} properties picked for you. Tap the heart to keep the ones you like.', { n: pickedList.length }) : t('{n} properties saved on this device.', { n: pickedList.length })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!shared && pickedList.length > 0 && (
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white hover:brightness-95">
                  <MessageCircle className="h-4 w-4" /> {t('Share my selection')}
                </a>
              )}
              <button type="button" onClick={showAll} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line/15 hover:ring-line/30">{t('See all properties')}</button>
            </div>
          </div>
        )}
        {pickedList === null && listings.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {present.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
                {(['all', ...present] as const).map(p => (
                  <button key={p} type="button" aria-pressed={purpose === p} onClick={() => { setPurpose(p); setFilters(f => ({ ...f, min: null, max: null })); }}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${purpose === p ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                    {p === 'all' ? t('All') : purposeLabel(p)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 sm:ms-auto">
              {types.length > 1 && (
                <select value={type} onChange={e => setType(e.target.value as PropertyType | 'all')} aria-label={t('Type')}
                  className="rounded-xl border border-line/[0.12] bg-surface px-3 py-2 text-sm">
                  <option value="all">{t('All types')}</option>
                  {types.map(x => <option key={x} value={x}>{typeLabel(x)}</option>)}
                </select>
              )}
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Neighborhood, city...')} aria-label={t('Search')}
                  className="w-full rounded-xl border border-line/[0.12] bg-surface py-2 pe-3 ps-9 text-sm outline-none focus:border-brand" />
              </div>
            </div>
          </div>
        )}
        {pickedList === null && listings.length > 1 && <ListingFilters f={filters} setF={setFilters} purpose={dealFor} count={shown.length} total={listings.length}
          extra={<>
            {viewToggle}
            {favs.length > 0 && (
              <button type="button" onClick={() => setFavOnly(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50">
                <Heart className="h-4 w-4 fill-current" /> <span className="max-sm:sr-only">{t('My favorites')}</span> <span className="tabular">{favs.length}</span>
              </button>
            )}
          </>} />}
        {listings.length === 0 && <p className="mt-8 text-center text-muted">{t('No properties are online right now.')}</p>}
        {pickedList === null && listings.length > 0 && shown.length === 0 && <p className="mt-8 text-center text-muted">{t('No property matches your search. Leave your number below and we will look for you.')}</p>}
        {mode === 'map' && (pickedList ?? shown).length > 0
          ? <ListingMap slug={office.slug} list={pickedList ?? shown} points={site?.points ?? {}} dark={themeName(office.style) === 'noir'} />
          : (
            <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {(pickedList ?? shown).map(p => <li key={p.reference}><PropertyCard slug={office.slug} p={p} /></li>)}
            </ul>
          )}
        {pickedList === null && listings.length > 0 && (
          <AlertBox slug={office.slug} purposes={present.length > 0 ? present : ['sale']} purpose={dealFor} type={type === 'all' ? null : type}
            filters={filters} hoods={hoods} hood={hoodFromQ} strong={shown.length === 0} />
        )}
      </Reveal>
    ),
    projects: projects.length > 0 ? (
      <Reveal id="projets">
        <Heading kicker={t('New build')} title={t('New-build projects')} />
        <ul className="grid gap-5 sm:grid-cols-2">
          {projects.map(pr => (
            <li key={pr.slug}><Link to={projectPath(office.slug, pr.slug)} className="group relative block overflow-hidden rounded-3xl bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {pr.cover ? <img src={photoUrl(pr.cover)} alt="" className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.04]" loading="lazy" />
                : <span className="night grid aspect-[16/10] w-full place-items-center"><HardHat className="h-12 w-12 text-white/80" /></span>}
              <span className="absolute start-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-night shadow-sm">{t('New build')} · {projectStatus(pr.status)}</span>
              <span className="absolute inset-x-0 bottom-0 block bg-black/55 p-4 text-white backdrop-blur-sm">
                <span className="block font-display text-xl font-bold">{pr.name}</span>
                <span className="mt-0.5 block text-sm text-white/85">
                  {[pr.city, t('{n} available', { n: pr.available_units }), pr.price_from !== null ? t('from {price}', { price: formatMad(pr.price_from) }) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
            </Link></li>
          ))}
        </ul>
      </Reveal>
    ) : null,
    about: (site?.about || services.length > 0) ? (
      <Reveal>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {site?.about && (
            <div>
              <Heading kicker={solo ? t('My story') : t('Our story')} title={solo ? t('About me') : t('About us')} />
              <p className="whitespace-pre-line text-lg leading-relaxed text-ink/85">{site.about}</p>
            </div>
          )}
          {services.length > 0 && (
            <div className="rounded-3xl bg-surface p-6 ring-1 ring-line/[0.08] sm:p-8">
              <h3 className="font-display text-xl font-bold">{t('Our services')}</h3>
              <ul className="mt-4 space-y-3">
                {services.map(s => <li key={s} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><span className="font-semibold">{s}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      </Reveal>
    ) : null,
    team: team.length > 0 ? (
      <Reveal>
        <Heading kicker={t('The people')} title={t('Our team')} />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {team.map(m => (
            <li key={m.name} className="rounded-3xl bg-surface p-5 text-center ring-1 ring-line/[0.08]">
              {m.photo ? <img src={photoUrl(m.photo, true)} alt="" className="mx-auto h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28" loading="lazy" />
                : <span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-surface-2 text-muted sm:h-28 sm:w-28"><UserRound className="h-10 w-10" /></span>}
              <p className="mt-3 font-display font-bold">{m.name}</p>
              {m.role && <p className="text-sm text-muted">{m.role}</p>}
              {m.langs.length > 0 && <p className="mt-1 text-xs text-muted">{m.langs.map(langLabel).join(' · ')}</p>}
              {m.whatsapp && <a href={waLink(m.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
            </li>
          ))}
        </ul>
      </Reveal>
    ) : null,
    reviews: reviews.length > 0 ? (
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Heading kicker={t('They trusted us')} title={t('What our clients say')} />
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-bold ring-1 ring-line/[0.08]">
            <Star className="h-4 w-4 fill-current text-warn" /><span className="tabular">{avg.toFixed(1).replace('.', ',')}</span><span className="font-normal text-muted">· {t('{n} reviews', { n: reviews.length })}</span>
          </p>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {reviews.map((r, i) => (
            <li key={i} className="w-[85%] shrink-0 snap-center rounded-3xl bg-surface p-6 ring-1 ring-line/[0.08] sm:w-auto">
              <Quote className="h-6 w-6 text-brand" />
              <p className="mt-3 leading-relaxed">{r.body}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-sm"><span className="font-bold">{r.author}</span>{r.place && <span className="text-muted"> · {r.place}</span>}</p>
                <span className="inline-flex text-warn">{[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? 'fill-current' : 'opacity-25'}`} />)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    ) : null,
    areas: areas.length > 0 ? (
      <Reveal id="quartiers">
        <div className="night overflow-hidden rounded-[2rem] p-7 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{t('Where we work')}</p>
          <h2 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{t('Our neighborhoods')}</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {areas.map(a => (
              <Link key={a} to={areaPath(office.slug, a)}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white hover:text-night">
                <MapPin className="h-4 w-4" />{a}
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    ) : null,
    map: mapPoints.length > 0 ? (
      <Reveal>
        <Heading kicker={t('Where we work')} title={t('Our properties on the map')} />
        <TileMap points={mapPoints} height={460} dark={themeName(office.style) === 'noir'} />
        <p className="mt-2 text-xs text-muted">{t('One point per neighborhood. The exact address of a property is shared by the agent.')}</p>
      </Reveal>
    ) : null,
    blog: posts.length > 0 ? (
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Heading kicker={t('Advice')} title={t('Our latest articles')} />
          <Link to={blogPath(office.slug)} className="mb-6 text-sm font-semibold text-brand hover:underline">{t('All articles')}</Link>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map(p => <li key={p.slug}><PostCardView slug={office.slug} p={p} /></li>)}</ul>
      </Reveal>
    ) : null,
    estimate: (
      <Reveal id="estimation">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Heading kicker={t('Owners')} title={t('How much is my property worth?')} />
          <Link to={estimationPath(office.slug)} className="mb-6 text-sm font-semibold text-brand hover:underline">{t('Open as a page')}</Link>
        </div>
        <EstimateBox slug={office.slug} areas={areas} />
      </Reveal>
    ),
    contact: (
      <Reveal id="contact" className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="rounded-3xl bg-surface p-6 ring-1 ring-line/[0.08] sm:p-8">
          <h2 className="font-display text-2xl font-bold">{t('Contact')}</h2>
          <ul className="mt-4 space-y-3">
            {office.whatsapp && <li><a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')} className="inline-flex items-center gap-3 font-semibold hover:text-brand"><MessageCircle className="h-5 w-5 text-brand" /><span dir="ltr">{office.whatsapp}</span></a></li>}
            {office.phone && <li><a href={telLink(office.phone)} onClick={() => logEvent(office.slug, null, 'call')} className="inline-flex items-center gap-3 font-semibold hover:text-brand"><Phone className="h-5 w-5 text-brand" /><span dir="ltr">{office.phone}</span></a></li>}
            {office.email && <li><a href={`mailto:${office.email}`} className="inline-flex items-center gap-3 font-semibold hover:text-brand"><Mail className="h-5 w-5 text-brand" />{office.email}</a></li>}
            {office.city && <li className="inline-flex items-center gap-3 text-muted"><MapPin className="h-5 w-5" />{office.city}</li>}
          </ul>
          {profiles.length > 0 && (
            <div className="mt-6 border-t border-line/[0.08] pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{solo ? t('Find me also on') : t('Find us also on')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profiles.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-1.5 text-sm font-semibold transition hover:text-brand">
                    {SITE_NAME[k]}<ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <InquiryForm slug={office.slug} reference={null} askPurpose />
      </Reveal>
    ),
  };

  return (
    <Layout office={office} stickyBar wide brand={office.style} flush={heroOn} site={office}>
      {heroOn ? (
        <section className="relative isolate overflow-hidden">
          {slides.length > 0 ? <HeroBackdrop slides={slides} slug={office.slug} /> : <div className="absolute inset-0 -z-10 bg-night" />}
          <div className="mx-auto flex min-h-[78svh] w-full max-w-6xl flex-col justify-end px-4 pb-24 pt-16 text-white sm:px-6 sm:pb-28 lg:min-h-[82vh]">
            <div className="rise max-w-3xl">
              {solo && (
                office.agent?.photo
                  ? <img src={photoUrl(office.agent.photo, true)} alt="" className="mb-5 h-20 w-20 rounded-full object-cover ring-4 ring-white/80 sm:h-24 sm:w-24" />
                  : null
              )}
              {(office.city || site?.areas) && <p className="flex items-center gap-1.5 text-sm font-semibold text-white/85"><MapPin className="h-4 w-4" />{[office.city, site?.areas].filter(Boolean).join(' · ')}</p>}
              <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">{site?.hero_title || name}</h1>
              <p className="mt-4 max-w-xl text-lg text-white/85 sm:text-xl">{site?.hero_sub || site?.tagline || (solo ? office.agent?.role : null) || ''}</p>
              {listings.length > 0 && (
                <HeroSearch purposes={present} hoods={hoods} onSearch={({ purpose: p, hood, max }) => {
                  setPurpose(p); setType('all'); setQ(hood); setFavOnly(false); setMode('list');
                  setFilters(f => ({ ...NO_FILTERS, sort: f.sort, max }));
                  window.setTimeout(() => document.getElementById('biens')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                }} />
              )}
              {listings.length === 0 && <div className="mt-7">{waBtn}</div>}
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <div className="rise max-w-3xl">
            {solo && office.agent?.photo && <img src={photoUrl(office.agent.photo, true)} alt="" className="mb-4 h-20 w-20 rounded-full object-cover" />}
            {(office.city || site?.areas) && <p className="flex items-center gap-1.5 text-sm font-semibold text-brand"><MapPin className="h-4 w-4" />{[office.city, site?.areas].filter(Boolean).join(' · ')}</p>}
            <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl">{site?.hero_title || name}</h1>
            {(site?.hero_sub || site?.tagline) && <p className="mt-3 text-lg text-muted">{site?.hero_sub || site?.tagline}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              <a href="#biens" className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-bg transition hover:opacity-90">{solo ? t('See my properties') : t('See our properties')}</a>
              {waBtn}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* the figures, half over the photo */}
        <div className={`relative z-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-line/10 shadow-xl ring-1 ring-line/[0.08] ${figures.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} ${heroOn ? '-mt-12' : 'mt-8'}`} aria-label={t('In figures')}>
          {figures.map((x, i) => (
            <div key={x.label} className={`bg-surface p-5 text-center sm:p-6 ${figures.length % 2 === 1 && i === figures.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <p className="font-display text-3xl font-bold text-brand sm:text-4xl"><CountUp n={x.n} /></p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{x.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-20 py-16 sm:space-y-24 sm:py-20">
          {blocks.map(b => <div key={b}>{sections[b]}</div>)}
        </div>
      </div>
      <ContactBar office={office} message={hello} sticky />
    </Layout>
  );
}
