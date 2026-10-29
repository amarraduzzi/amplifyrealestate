import { Bath, BedDouble, MapPin, Ruler } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { photoUrl, type PublicCard } from '../lib/api';
import { placeText, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/format';
import { Link, propertyPath } from '../lib/router';
import { t } from '../lib/i18n';
import { PropertyIcon } from './PropertyIcon';
import { FavButton } from './FavButton';

/** A property in a list: the photo first and large, then the price, the title and the key facts. */
const NEW_DAYS = 14;

export function PropertyCard({ slug, p }: { slug: string; p: PublicCard }) {
  const place = placeText(p);
  const drop = p.old_price_cents && p.price_cents !== null && p.old_price_cents > p.price_cents
    ? Math.round((1 - p.price_cents / p.old_price_cents) * 100) : 0;
  const fresh = !drop && !!p.published_at && Date.now() - new Date(p.published_at).getTime() < NEW_DAYS * 86_400_000;
  return (
    <div className="relative">
    <Link to={propertyPath(slug, p.reference)}
      className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="relative block overflow-hidden rounded-3xl bg-surface-3">
        {p.cover
          ? <img src={photoUrl(p.cover, true)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          : <span className="night grid aspect-[4/3] w-full place-items-center"><PropertyIcon type={p.property_type} className="h-10 w-10 text-white/85" /></span>}
        <span className="absolute start-3 end-14 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-night shadow-sm">{purposeLabel(p.purpose)}</span>
          {drop > 0 && p.status === 'available' && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t('Price drop')} -{drop}%</span>}
          {fresh && p.status === 'available' && <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t('New')}</span>}
          {p.status !== 'available' && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>}
        </span>
      </span>
      <span className="block px-1 pt-3">
        <span className="flex items-baseline gap-x-1.5">
          <span className="font-display tabular text-xl font-bold">{formatMad(p.price_cents)}</span>
          <span className="text-xs text-muted">{priceSuffix(p.purpose)}</span>
          {drop > 0 && <span className="tabular text-sm text-muted line-through">{formatMad(p.old_price_cents!)}</span>}
        </span>
        <span className="mt-0.5 block truncate font-semibold group-hover:text-brand">{p.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>{typeLabel(p.property_type)}</span>
          {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
          {p.bedrooms !== null && <span className="inline-flex items-center gap-1" title={t('Bedrooms')}><BedDouble className="h-3.5 w-3.5" />{p.bedrooms}</span>}
          {p.bathrooms !== null && <span className="inline-flex items-center gap-1" title={t('Bathrooms')}><Bath className="h-3.5 w-3.5" />{p.bathrooms}</span>}
          {p.area_m2 !== null && <span className="inline-flex items-center gap-1" title={t('Area')}><Ruler className="h-3.5 w-3.5" />{Number(p.area_m2)} m²</span>}
        </span>
      </span>
    </Link>
    <FavButton slug={slug} reference={p.reference} />
    </div>
  );
}
