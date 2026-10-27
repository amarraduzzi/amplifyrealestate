import { useEffect, type ReactNode } from 'react';
import { Bath, BedDouble, CheckCircle2, Info, MapPin, MessageCircle, Ruler, Sofa } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { loadProperty } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { confirmedText, placeText, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/format';
import { t } from '../lib/i18n';
import { Link } from '../lib/router';
import { Layout } from '../components/Layout';
import { ContactBar } from '../components/ContactBar';
import { PropertyIcon } from '../components/PropertyIcon';
import { Failed, Loading, NotFound } from './States';

export function PropertyView({ slug, reference }: { slug: string; reference: string }) {
  const [state, retry] = useFetch(() => loadProperty(slug, reference), `${slug}/${reference}`);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${data.property.title} · ${data.office.name}` : 'Amplify Real Estate';
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This property is no longer online, or the link is not correct.')} />;

  const { office, property: p } = data;
  const place = placeText(p);
  const confirmed = confirmedText(p.info_confirmed_at);
  const link = window.location.origin + window.location.pathname;
  const message = t('Hello, I am interested in “{title}” ({ref}). {url}', { title: p.title, ref: p.reference, url: link });
  const banner = p.status === 'reserved' ? t('This property is currently reserved. Contact us for similar properties.')
    : p.status === 'rented' ? t('This property has been rented. Contact us for similar properties.')
    : p.status === 'sold' ? t('This property has been sold. Contact us for similar properties.') : null;

  const specs: { icon: ReactNode; value: string; label: string }[] = [];
  if (p.bedrooms !== null) specs.push({ icon: <BedDouble className="h-5 w-5" />, value: String(p.bedrooms), label: t('Bedrooms') });
  if (p.bathrooms !== null) specs.push({ icon: <Bath className="h-5 w-5" />, value: String(p.bathrooms), label: t('Bathrooms') });
  if (p.area_m2 !== null) specs.push({ icon: <Ruler className="h-5 w-5" />, value: `${Number(p.area_m2)} m²`, label: t('Area') });
  if (p.furnished !== null) specs.push({ icon: <Sofa className="h-5 w-5" />, value: p.furnished ? t('Furnished') : t('Unfurnished'), label: '' });

  return (
    <Layout office={office} stickyBar>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <section className="night rise rounded-3xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><PropertyIcon type={p.property_type} className="h-6 w-6" /></span>
            <span className="flex flex-wrap justify-end gap-1.5">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15">{purposeLabel(p.purpose)}</span>
              {p.status !== 'available' && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusCls(p.status)} !bg-white`}>{statusLabel(p.status)}</span>}
            </span>
          </div>
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display tabular text-4xl font-bold">{formatMad(p.price_cents)}</span>
            <span className="text-sm text-white/70">{priceSuffix(p.purpose)}</span>
          </p>
          <h1 className="mt-2 font-display text-xl font-semibold leading-snug sm:text-2xl">{p.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
            <span>{typeLabel(p.property_type)}</span>
            {place && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{place}</span>}
          </p>
          <p className="tabular mt-4 text-xs text-white/55">{t('Reference')}: <span dir="ltr">{p.reference}</span></p>
        </section>

        {banner && (
          <p className="flex items-start gap-2 rounded-2xl bg-warn/10 px-4 py-3 text-sm font-semibold text-warn"><Info className="mt-0.5 h-4 w-4 shrink-0" />{banner}</p>
        )}

        {specs.length > 0 && (
          <section aria-label={t('Details')} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {specs.map((s, i) => (
              <div key={i} className="card flex items-center gap-3 rounded-2xl p-3.5">
                <span className="text-brand">{s.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.value}</span>
                  {s.label && <span className="block truncate text-xs text-muted">{s.label}</span>}
                </span>
              </div>
            ))}
          </section>
        )}

        {p.description && (
          <section className="card rounded-2xl p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-semibold">{t('Description')}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
          </section>
        )}

        <section className="card rounded-2xl p-4 sm:p-5">
          <h2 className="mb-2 text-sm font-semibold">{t('Location')}</h2>
          <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0 text-brand" />{place || '—'}</p>
          <p className="mt-1.5 text-xs text-muted">{t('The exact address is shared on request.')}</p>
          {confirmed && (
            <p className="mt-4 flex items-center gap-1.5 border-t border-line/[0.07] pt-3 text-xs font-semibold text-muted">
              <CheckCircle2 className="h-4 w-4 text-ok" />{t('Price and availability')} · {confirmed}
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/${office.slug}`} className="text-sm font-semibold text-brand hover:underline">{t('More properties from {office}', { office: office.name })}</Link>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${p.title}\n${link}`)}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2">
            <MessageCircle className="h-4 w-4" />{t('Share on WhatsApp')}
          </a>
        </div>
      </div>
      <ContactBar office={office} message={message} sticky />
    </Layout>
  );
}
