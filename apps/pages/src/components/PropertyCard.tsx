import { Bath, BedDouble, MapPin, Ruler } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { photoUrl, type PublicCard } from '../lib/api';
import { placeText, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/format';
import { Link, propertyPath } from '../lib/router';
import { t } from '../lib/i18n';
import { PropertyIcon } from './PropertyIcon';

export function PropertyCard({ slug, p }: { slug: string; p: PublicCard }) {
  const place = placeText(p);
  return (
    <Link to={propertyPath(slug, p.reference)}
      className="card group flex gap-3.5 rounded-2xl p-3.5 transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-4">
      {p.cover
        ? <img src={photoUrl(p.cover, true)} alt="" loading="lazy" width={80} height={80} className="h-16 w-16 shrink-0 rounded-xl bg-surface-3 object-cover sm:h-20 sm:w-20" />
        : <span className="night grid h-16 w-16 shrink-0 place-items-center rounded-xl sm:h-20 sm:w-20"><PropertyIcon type={p.property_type} className="h-7 w-7 text-white/90 sm:h-8 sm:w-8" /></span>}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{purposeLabel(p.purpose)}</span>
          {p.status !== 'available' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>}
        </span>
        <span className="mt-1 block truncate font-semibold">{p.title}</span>
        <span className="mt-0.5 flex items-baseline gap-x-1.5">
          <span className="font-display tabular text-lg font-bold">{formatMad(p.price_cents)}</span>
          <span className="text-xs text-muted">{priceSuffix(p.purpose)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>{typeLabel(p.property_type)}</span>
          {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
          {p.bedrooms !== null && <span className="inline-flex items-center gap-1" title={t('Bedrooms')}><BedDouble className="h-3.5 w-3.5" />{p.bedrooms}</span>}
          {p.bathrooms !== null && <span className="inline-flex items-center gap-1" title={t('Bathrooms')}><Bath className="h-3.5 w-3.5" />{p.bathrooms}</span>}
          {p.area_m2 !== null && <span className="inline-flex items-center gap-1" title={t('Area')}><Ruler className="h-3.5 w-3.5" />{Number(p.area_m2)} m²</span>}
        </span>
      </span>
    </Link>
  );
}
