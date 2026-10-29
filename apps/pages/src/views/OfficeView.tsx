import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ExternalLink, HardHat, Mail, MapPin, MessageCircle, Phone, Quote, Search, Star, UserRound } from 'lucide-react';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';
import { formatMad } from '@vastgoed/shared';
import { loadOffice, loadOfficeProjects, logEvent, photoUrl, type ProjectCard, type SiteBlock } from '../lib/api';
import { Link, areaPath, areaSlug, blogPath, estimationPath, navigate, projectPath } from '../lib/router';
import { TileMap } from '../components/TileMap';
import { PostCardView } from './BlogView';
import { themeName } from '../lib/theme';
import { EstimateBox } from '../components/EstimateBox';
import { projectStatus } from './ProjectView';
import { useFetch } from '../lib/useFetch';
import { purposeLabel, typeLabel } from '../lib/format';
import { t } from '../lib/i18n';
import { telLink, waLink } from '../lib/contact';
import { Layout } from '../components/Layout';
import { langLabel } from '../lib/vitrine';
import { ContactBar } from '../components/ContactBar';
import { PropertyCard } from '../components/PropertyCard';
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
  return <section ref={ref} id={id} className={`reveal scroll-mt-6 ${className}`}>{children}</section>;
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
  const [heroQ, setHeroQ] = useState('');
  const [heroPurpose, setHeroPurpose] = useState<DealPurpose | 'all'>('all');
  useEffect(() => { setPurpose('all'); setType('all'); setQ(''); }, [slug]);

  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${data.office.name}${data.site?.tagline ? ` · ${data.site.tagline}` : ''}` : 'Amplify Real Estate';
  }, [data]);
  useEffect(() => { if (data) logEvent(data.office.slug, null, 'view'); }, [data]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  useEffect(() => { loadOfficeProjects(slug).then(setProjects); }, [slug]);

  const present = useMemo(() => PURPOSES.filter(p => data?.listings.some(l => l.purpose === p)), [data]);
  const types = useMemo(() => Array.from(new Set((data?.listings ?? []).map(l => l.property_type))), [data]);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return (data?.listings ?? []).filter(l => (purpose === 'all' || l.purpose === purpose) && (type === 'all' || l.property_type === type)
      && (!n || norm([l.title, l.neighborhood, l.city, l.reference].filter(Boolean).join(' ')).includes(n)));
  }, [data, purpose, type, q]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This page does not exist, or the link is not correct.')} />;

  const { office, listings } = data;
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
  const heroImg = site?.hero ?? listings.find(l => l.cover)?.cover ?? null;
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
  const goSearch = (text: string, p: DealPurpose | 'all') => {
    setQ(text); setPurpose(p); setType('all');
    document.getElementById('biens')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const waBtn = office.whatsapp && (
    <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
      className="gold-fill inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105">
      <MessageCircle className="h-4 w-4" />{t('Contact on WhatsApp')}
    </a>
  );

  const sections: Record<SiteBlock, ReactNode> = {
    hero: null,
    listings: (
      <Reveal id="biens">
        <Heading kicker={t('Our selection')} title={t('Available properties')} />
        {listings.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {present.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
                {(['all', ...present] as const).map(p => (
                  <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)}
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
        {listings.length === 0 && <p className="mt-8 text-center text-muted">{t('No properties are online right now.')}</p>}
        {listings.length > 0 && shown.length === 0 && <p className="mt-8 text-center text-muted">{t('No property matches your search. Leave your number below and we will look for you.')}</p>}
        <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(p => <li key={p.reference}><PropertyCard slug={office.slug} p={p} /></li>)}
        </ul>
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
      <Reveal>
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
    <Layout office={office} stickyBar wide brand={office.style} flush={heroOn}>
      {heroOn ? (
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-night">
            {heroImg && <img src={photoUrl(heroImg)} alt="" className="slowzoom h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-black/45" />
          </div>
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
                <form onSubmit={e => { e.preventDefault(); goSearch(heroQ, heroPurpose); }}
                  className="mt-7 flex flex-col gap-2 rounded-2xl bg-surface p-2 text-ink shadow-2xl sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input value={heroQ} onChange={e => setHeroQ(e.target.value)} placeholder={t('Neighborhood, city...')} aria-label={t('Search')}
                      className="w-full rounded-xl bg-transparent py-3 pe-3 ps-10 outline-none" />
                  </div>
                  {present.length > 1 && (
                    <select value={heroPurpose} onChange={e => setHeroPurpose(e.target.value as DealPurpose | 'all')} aria-label={t('Type')}
                      className="rounded-xl bg-surface-2 px-3 py-3 text-sm font-semibold outline-none">
                      <option value="all">{t('All')}</option>
                      {present.map(p => <option key={p} value={p}>{purposeLabel(p)}</option>)}
                    </select>
                  )}
                  <button type="submit" className="gold-fill rounded-xl px-6 py-3 text-sm font-bold text-brand-ink">{t('Search')}</button>
                </form>
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
        <div className={`relative z-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-line/10 shadow-xl ring-1 ring-line/[0.08] sm:grid-cols-4 ${heroOn ? '-mt-12' : 'mt-8'}`} aria-label={t('In figures')}>
          {figures.map(x => (
            <div key={x.label} className="bg-surface p-5 text-center sm:p-6">
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
