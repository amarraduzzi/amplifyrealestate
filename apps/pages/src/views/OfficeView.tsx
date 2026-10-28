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

  return (
    <Layout office={office} stickyBar>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
        {/* Hero */}
        <section className="night rise overflow-hidden rounded-3xl p-6 sm:p-9">
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{office.name}</h1>
          {site?.tagline && <p className="mt-2 max-w-xl text-lg text-white/85">{site.tagline}</p>}
          {(office.city || site?.areas) && (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-white/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{[office.city, site?.areas].filter(Boolean).join(' · ')}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <a href="#biens" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-night transition hover:opacity-90">{t('See our properties')}</a>
            {office.whatsapp && (
              <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/15">
                <MessageCircle className="h-4 w-4" />{t('Contact on WhatsApp')}
              </a>
            )}
          </div>
        </section>

        {/* Figures */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label={t('In figures')}>
          {[
            { n: listings.length, label: t('Properties online') },
            { n: forSale, label: t('For sale') },
            { n: forRent, label: t('For rent') },
            ...(site && site.done > 0 ? [{ n: site.done, label: t('Sold or rented') }] : []),
          ].map(x => (
            <div key={x.label} className="card rounded-2xl p-4 text-center">
              <p className="font-display tabular text-2xl font-bold text-brand">{x.n}</p>
              <p className="text-xs text-muted">{x.label}</p>
            </div>
          ))}
        </section>

        {/* Properties */}
        {projects.length > 0 && (
          <section id="projets" className="scroll-mt-4">
            <h2 className="font-display text-2xl font-bold">{t('New-build projects')}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {projects.map(pr => (
                <li key={pr.slug} className="rise"><Link to={projectPath(office.slug, pr.slug)} className="card block overflow-hidden rounded-3xl transition hover:ring-2 hover:ring-brand/25">
                  {pr.cover ? <img src={photoUrl(pr.cover, true)} alt="" className="h-40 w-full bg-surface-3 object-cover" loading="lazy" />
                    : <span className="night grid h-40 place-items-center"><HardHat className="h-10 w-10 text-white/80" /></span>}
                  <span className="block p-4">
                    <span className="block font-display text-lg font-bold">{pr.name}</span>
                    <span className="block text-xs text-muted">{[pr.city, projectStatus(pr.status)].filter(Boolean).join(' · ')}</span>
                    <span className="mt-1 block text-sm">{t('{n} available', { n: pr.available_units })}{pr.price_from !== null ? ` · ${t('from {price}', { price: formatMad(pr.price_from) })}` : ''}</span>
                  </span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        <section id="biens" className="scroll-mt-4">
          <h2 className="font-display text-2xl font-bold">{t('Available properties')}</h2>
          {listings.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
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
