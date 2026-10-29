import { useEffect, useState, type ReactNode } from 'react';
import { Bath, BedDouble, CheckCircle2, Compass, Info, Layers, MapPin, MessageCircle, Phone, Ruler, Sofa, Wallet } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadProperty, logEvent } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { confirmedText, placeText, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/format';
import { getLang, t } from '../lib/i18n';
import { telLink, waLink } from '../lib/contact';
import { Link, officePath } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { InquiryForm } from '../components/InquiryForm';
import { BookingBox } from '../components/BookingBox';
import { PhotoMosaic, StoryHero } from '../components/PhotoHero';
import { PropertyIcon } from '../components/PropertyIcon';
import { PropertyCard } from '../components/PropertyCard';
import { AgentBlock, AideBadge, EuroLine, Highlights, MortgageCalc, NearList, TitleBadge, VideoVisitButton } from '../components/Vitrine';
import { orientationLabel } from '../lib/vitrine';
import { Failed, Loading, NotFound } from './States';

/**
 * A property page that sells: photos first (direction 1). On the right on a computer a fixed card with the price
 * and the way to book or contact; on a phone that is the bar at the bottom. A short stay on a phone opens like a
 * story (direction 3): the photos fill the screen with the price on them, and the free dates come right after.
 */
export function PropertyView({ slug, reference }: { slug: string; reference: string }) {
  const [state, retry] = useFetch(() => loadProperty(slug, reference), `${slug}/${reference}`);
  const data = state.status === 'ready' ? state.data : null;
  const [bookable, setBookable] = useState(false);
  useEffect(() => {
    document.title = data ? `${data.property.title} · ${data.office.name}` : 'Amplify Real Estate';
  }, [data]);
  useEffect(() => { if (data) logEvent(data.office.slug, data.property.reference, 'view'); }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This property is no longer online, or the link is not correct.')} />;

  const { office, property: p } = data;
  const similar = data.similar ?? [];
  const sale = p.purpose === 'sale';
  const euroSuffix = p.purpose === 'rent_long' ? ` ${t('/ month')}` : '';
  const photos = p.photos ?? [];
  const place = placeText(p);
  const confirmed = confirmedText(p.info_confirmed_at);
  const link = window.location.origin + window.location.pathname;
  const videoMsg = t('Hello, I live abroad. Could I get a video visit of “{title}” ({ref})? {url}', { title: p.title, ref: p.reference, url: link });
  const message = t('Hello, I am interested in “{title}” ({ref}). {url}', { title: p.title, ref: p.reference, url: link });
  const short = p.purpose === 'rent_short' && p.status === 'available';
  const banner = p.status === 'reserved' ? t('This property is currently reserved. Contact us for similar properties.')
    : p.status === 'rented' ? t('This property has been rented. Contact us for similar properties.')
    : p.status === 'sold' ? t('This property has been sold. Contact us for similar properties.') : null;
  const icon = <PropertyIcon type={p.property_type} className="h-7 w-7" />;

  const specs: { icon: ReactNode; value: string; label: string }[] = [];
  if (p.bedrooms !== null) specs.push({ icon: <BedDouble className="h-5 w-5" />, value: String(p.bedrooms), label: t('Bedrooms') });
  if (p.bathrooms !== null) specs.push({ icon: <Bath className="h-5 w-5" />, value: String(p.bathrooms), label: t('Bathrooms') });
  if (p.area_m2 !== null) specs.push({ icon: <Ruler className="h-5 w-5" />, value: `${Number(p.area_m2)} m²`, label: t('Area') });
  if (p.furnished !== null) specs.push({ icon: <Sofa className="h-5 w-5" />, value: p.furnished ? t('Furnished') : t('Unfurnished'), label: '' });
  if (p.floor != null) specs.push({ icon: <Layers className="h-5 w-5" />, value: p.floor === 0 ? t('Ground floor') : p.floor < 0 ? t('Basement {n}', { n: -p.floor }) : t('Floor {n}', { n: p.floor }), label: (p.features ?? []).includes('elevator') ? t('With elevator') : '' });
  if (p.orientation) specs.push({ icon: <Compass className="h-5 w-5" />, value: orientationLabel(p.orientation), label: t('Orientation') });
  if (p.syndic_cents != null) specs.push({ icon: <Wallet className="h-5 w-5" />, value: formatMad(p.syndic_cents), label: t('Syndic per month') });
  const facts = [
    p.bedrooms !== null ? (p.bedrooms === 1 ? t('1 bedroom') : t('{n} bedrooms', { n: p.bedrooms })) : null,
    p.area_m2 !== null ? `${Number(p.area_m2)} m²` : null,
    p.furnished ? t('Furnished') : null,
  ].filter(Boolean) as string[];
  const toBooking = () => document.getElementById('reserver')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const priceCard = (
    <div className="card rounded-3xl p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{purposeLabel(p.purpose)}</span>
        {p.status !== 'available' && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>}
        {sale && <TitleBadge status={p.title_status} />}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display tabular text-3xl font-bold">{formatMad(p.price_cents)}</span>
        <span className="text-sm text-muted">{priceSuffix(p.purpose)}</span>
      </p>
      {!short && <EuroLine cents={p.price_cents} suffix={euroSuffix} />}
      {confirmed && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><CheckCircle2 className="h-4 w-4 text-ok" />{t('Price and availability')} · {confirmed}</p>}
      <div className="mt-4 space-y-2">
        {short && bookable && <button type="button" onClick={toBooking} className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-bg transition hover:opacity-90">{t('See the free dates')}</button>}
        {office.whatsapp && (
          <a href={waLink(office.whatsapp, message)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, p.reference, 'whatsapp')}
            className="gold-fill flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105">
            <MessageCircle className="h-5 w-5" /> {t('Contact on WhatsApp')}
          </a>
        )}
        {office.phone && (
          <a href={telLink(office.phone)} onClick={() => logEvent(office.slug, p.reference, 'call')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-3 text-sm font-bold transition hover:bg-surface-2">
            <Phone className="h-5 w-5" /> {t('Call')}
          </a>
        )}
        {!short && office.whatsapp && <VideoVisitButton href={waLink(office.whatsapp, videoMsg)} onClick={() => logEvent(office.slug, p.reference, 'whatsapp')} />}
      </div>
      {office.agent && <div className="mt-4 border-t border-line/[0.07] pt-4"><AgentBlock agent={office.agent} compact /></div>}
      <p className="mt-4 border-t border-line/[0.07] pt-3 text-xs text-muted">{office.name}{office.city ? ` · ${office.city}` : ''} · <span dir="ltr">{p.reference}</span></p>
    </div>
  );

  return (
    <Layout office={office} stickyBar wide brand={office.style} site={office}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {/* direction 3: a short stay on a phone opens like a story */}
        {short && photos.length > 0 && (
          <StoryHero photos={photos} title={p.title} icon={icon} price={formatMad(p.price_cents)} facts={facts} place={place} onBook={toBooking} />
        )}

        {/* direction 1: title above the photos on a computer */}
        <div className={`mb-4 ${short && photos.length > 0 ? 'hidden sm:block' : ''}`}>
          <p className="text-sm text-muted">
            <Link to={officePath(office.slug)} className="font-semibold text-brand hover:underline">{office.name}</Link> · {typeLabel(p.property_type)}{place ? ` · ${place}` : ''}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight sm:text-4xl">{p.title}</h1>
        </div>
        <PhotoMosaic photos={photos} title={p.title} icon={icon} className={short && photos.length > 0 ? 'hidden sm:block' : ''} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-5">
            {/* on a phone the price comes first, under the photos */}
            <div className={`lg:hidden ${short && photos.length > 0 ? 'hidden' : ''}`}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-display tabular text-3xl font-bold">{formatMad(p.price_cents)}</span>
                <span className="text-sm text-muted">{priceSuffix(p.purpose)}</span>
                {p.status !== 'available' && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>}
                {sale && <TitleBadge status={p.title_status} />}
              </p>
              <EuroLine cents={p.price_cents} suffix={euroSuffix} />
              {confirmed && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><CheckCircle2 className="h-4 w-4 text-ok" />{t('Price and availability')} · {confirmed}</p>}
            </div>

            {banner && <p className="flex items-start gap-2 rounded-2xl bg-warn/10 px-4 py-3 text-sm font-semibold text-warn"><Info className="mt-0.5 h-4 w-4 shrink-0" />{banner}</p>}

            {specs.length > 0 && (
              <section aria-label={t('Details')} className="flex flex-wrap gap-x-6 gap-y-3 border-y border-line/[0.08] py-4">
                {specs.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="text-brand">{s.icon}</span>
                    <span><span className="block font-semibold leading-tight">{s.value}</span>{s.label && <span className="block text-xs text-muted">{s.label}</span>}</span>
                  </div>
                ))}
              </section>
            )}

            <Highlights features={p.features} />
            {sale && p.status === 'available' && <AideBadge cents={p.price_cents} />}

            {short && <BookingBox slug={office.slug} reference={p.reference} onReady={setBookable} onBook={tk => { window.location.href = `/b/${tk}?lang=${getLang()}`; }} />}

            {p.description && (
              <section>
                <h2 className="mb-2 font-display text-lg font-bold">{t('Description')}</h2>
                <p className="whitespace-pre-line leading-relaxed">{p.description}</p>
              </section>
            )}

            {sale && p.status === 'available' && <MortgageCalc priceCents={p.price_cents} />}

            <section>
              <h2 className="mb-2 font-display text-lg font-bold">{t('Location')}</h2>
              <p className="flex items-center gap-2"><MapPin className="h-5 w-5 shrink-0 text-brand" />{place || '—'}</p>
              <NearList near={p.near} />
              <p className="mt-2 text-sm text-muted">{t('The exact address is shared on request.')}</p>
            </section>

            {(office.agent || (!short && office.whatsapp)) && (
              <div className="space-y-2 lg:hidden">
                <AgentBlock agent={office.agent} />
                {!short && office.whatsapp && <VideoVisitButton href={waLink(office.whatsapp, videoMsg)} onClick={() => logEvent(office.slug, p.reference, 'whatsapp')} />}
              </div>
            )}

            {!bookable && <InquiryForm slug={office.slug} reference={p.reference} />}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={officePath(office.slug)} className="text-sm font-semibold text-brand hover:underline">{t('More properties from {office}', { office: office.name })}</Link>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${p.title}\n${link}`)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2">
                <MessageCircle className="h-4 w-4" />{t('Share on WhatsApp')}
              </a>
            </div>
          </div>

          {/* direction 1: the fixed card on a computer */}
          <aside className="hidden lg:sticky lg:top-6 lg:block">{priceCard}</aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-12 border-t border-line/[0.08] pt-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-2xl font-bold">{t('Similar properties')}</h2>
              <Link to={officePath(office.slug)} className="text-sm font-semibold text-brand hover:underline">{t('More properties from {office}', { office: office.name })}</Link>
            </div>
            <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map(c => <li key={c.reference}><PropertyCard slug={office.slug} p={c} /></li>)}
            </ul>
          </section>
        )}
      </div>
      <div className="lg:hidden"><ContactBar office={office} message={message} reference={p.reference} sticky /></div>
    </Layout>
  );
}
