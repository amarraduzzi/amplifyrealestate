import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, MapPin, MessageCircle, Phone, Search } from 'lucide-react';
import type { DealPurpose, PropertyType } from '@vastgoed/shared';
import { loadOffice, loadOfficeProjects, logEvent, photoUrl, type ProjectCard } from '../lib/api';
import { Link, projectPath } from '../lib/router';
import { projectStatus } from './ProjectView';
import { formatMad } from '@vastgoed/shared';
import { HardHat } from 'lucide-react';
import { useFetch } from '../lib/useFetch';
import { purposeLabel, typeLabel } from '../lib/format';
import { t } from '../lib/i18n';
import { telLink, waLink } from '../lib/contact';
import { Layout } from '../components/Layout';
import { langLabel } from '../lib/vitrine';
import { UserRound } from 'lucide-react';
import { ContactBar } from '../components/ContactBar';
import { PropertyCard } from '../components/PropertyCard';
import { InquiryForm } from '../components/InquiryForm';
import { Failed, Loading, NotFound } from './States';

const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The office website: who they are, all properties online with search, what they do, and how to reach them. */
export function OfficeView({ slug }: { slug: string }) {
  const [state, retry] = useFetch(() => loadOffice(slug), slug);
  const [purpose, setPurpose] = useState<DealPurpose | 'all'>('all');
  const [type, setType] = useState<PropertyType | 'all'>('all');
  const [q, setQ] = useState('');
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
  const hello = t('Hello, I would like information about your properties.');
  const forSale = listings.filter(l => l.purpose === 'sale').length;
  const forRent = listings.length - forSale;
  const solo = office.edition === 'agent' && !!office.agent;

  const covers = listings.filter(l => l.cover).slice(0, 3).map(l => l.cover as string);
  const figures = [
    { n: listings.length, label: t('Properties online') },
    { n: forSale, label: t('For sale') },
    { n: forRent, label: t('For rent') },
    ...(site && site.done > 0 ? [{ n: site.done, label: t('Sold or rented') }] : []),
  ];

  return (
    <Layout office={office} stickyBar wide>
      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-5 sm:px-6 sm:py-8">
        {/* Hero: who they are next to their own photos */}
        <section className={`rise grid gap-5 ${covers.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center' : ''}`}>
          <div className={covers.length ? 'order-2 lg:order-1' : ''}>
            {(office.city || site?.areas) && (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-brand"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{[office.city, site?.areas].filter(Boolean).join(' · ')}</p>
            )}
            {solo && (
              <div className="mt-4 flex items-center gap-4">
                {office.agent?.photo
                  ? <img src={photoUrl(office.agent.photo)} alt="" className="h-20 w-20 rounded-full bg-surface-3 object-cover ring-4 ring-surface sm:h-24 sm:w-24" />
                  : <span className="grid h-20 w-20 place-items-center rounded-full bg-surface-2 text-muted sm:h-24 sm:w-24"><UserRound className="h-9 w-9" /></span>}
                <div className="min-w-0">
                  {office.agent?.role && <p className="font-semibold">{office.agent.role}</p>}
                  {office.agent && office.agent.langs.length > 0 && <p className="text-sm text-muted">{t('Speaks {langs}', { langs: office.agent.langs.map(langLabel).join(', ') })}</p>}
                </div>
              </div>
            )}
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-5xl">{solo ? office.agent!.name : office.name}</h1>
            {solo && office.agent!.name !== office.name && <p className="mt-1 text-muted">{office.name}</p>}
            {site?.tagline && <p className="mt-3 max-w-xl text-lg text-muted">{site.tagline}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              <a href="#biens" className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-bg transition hover:opacity-90">{solo ? t('See my properties') : t('See our properties')}</a>
              {office.whatsapp && (
                <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
                  className="gold-fill inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105">
                  <MessageCircle className="h-4 w-4" />{t('Contact on WhatsApp')}
                </a>
              )}
            </div>
            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-line/[0.08] pt-5" aria-label={t('In figures')}>
              {figures.map(x => (
                <div key={x.label}>
                  <dt className="sr-only">{x.label}</dt>
                  <dd><span className="block font-display tabular text-2xl font-bold">{x.n}</span><span className="text-xs text-muted">{x.label}</span></dd>
                </div>
              ))}
            </dl>
          </div>
          {covers.length > 0 && (
            <div className={`order-1 -mx-4 grid gap-2 sm:mx-0 lg:order-2 ${covers.length >= 3 ? 'sm:grid-cols-3 sm:grid-rows-2' : covers.length === 2 ? 'sm:grid-cols-3' : ''} sm:h-80 lg:h-[26rem]`}>
              {covers.map((c, k) => (
                <img key={c} src={photoUrl(c, k > 0)} alt="" loading={k ? 'lazy' : 'eager'}
                  className={`h-64 w-full bg-surface-3 object-cover sm:h-full sm:rounded-3xl ${k === 0 ? (covers.length >= 3 ? 'sm:col-span-2 sm:row-span-2' : covers.length === 2 ? 'sm:col-span-2' : '') : 'hidden sm:block'}`} />
              ))}
            </div>
          )}
        </section>

        {/* Projects */}
        {projects.length > 0 && (
          <section id="projets" className="scroll-mt-4">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">{t('New-build projects')}</h2>
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
              {projects.map(pr => (
                <li key={pr.slug} className="rise"><Link to={projectPath(office.slug, pr.slug)} className="group relative block overflow-hidden rounded-3xl bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {pr.cover ? <img src={photoUrl(pr.cover)} alt="" className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
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
          </section>
        )}

        {/* Properties */}
        <section id="biens" className="scroll-mt-4">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">{t('Available properties')}</h2>
          {listings.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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
            {shown.map(p => <li key={p.reference} className="rise"><PropertyCard slug={office.slug} p={p} /></li>)}
          </ul>
        </section>

        {/* About and services */}
        {(site?.about || services.length > 0) && (
          <section className="grid gap-4 md:grid-cols-2">
            {site?.about && (
              <div className="card rounded-2xl p-5">
                <h2 className="font-display text-lg font-bold">{t('About us')}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{site.about}</p>
              </div>
            )}
            {services.length > 0 && (
              <div className="card rounded-2xl p-5">
                <h2 className="font-display text-lg font-bold">{t('Our services')}</h2>
                <ul className="mt-2 space-y-1.5">
                  {services.map(s => <li key={s} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{s}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Contact */}
        <section className="grid gap-4 md:grid-cols-2 md:items-start" id="contact">
          <div className="card rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold">{t('Contact')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {office.whatsapp && <li><a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')} className="inline-flex items-center gap-2 font-semibold hover:text-brand"><MessageCircle className="h-4 w-4 text-ok" /><span dir="ltr">{office.whatsapp}</span></a></li>}
              {office.phone && <li><a href={telLink(office.phone)} onClick={() => logEvent(office.slug, null, 'call')} className="inline-flex items-center gap-2 font-semibold hover:text-brand"><Phone className="h-4 w-4 text-brand" /><span dir="ltr">{office.phone}</span></a></li>}
              {office.email && <li><a href={`mailto:${office.email}`} className="inline-flex items-center gap-2 font-semibold hover:text-brand"><Mail className="h-4 w-4 text-brand" />{office.email}</a></li>}
              {office.city && <li className="inline-flex items-center gap-2 text-muted"><MapPin className="h-4 w-4" />{office.city}</li>}
            </ul>
          </div>
          <InquiryForm slug={office.slug} reference={null} askPurpose />
        </section>
      </div>
      <ContactBar office={office} message={hello} sticky />
    </Layout>
  );
}
