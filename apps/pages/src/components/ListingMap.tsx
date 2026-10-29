import { useMemo, useState } from 'react';
import { ArrowRight, BedDouble, MapPin, Ruler, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { photoUrl, type PublicCard } from '../lib/api';
import { placeText, priceSuffix, purposeLabel } from '../lib/format';
import { Link, areaSlug, propertyPath } from '../lib/router';
import { t } from '../lib/i18n';
import { TileMap, type MapPoint } from './TileMap';
import { PropertyIcon } from './PropertyIcon';
import { FavButton } from './FavButton';

/**
 * Rough centers of neighborhoods around Rabat, used when the office did not place a neighborhood on its map itself.
 * Only the neighborhood is shown, never the address of a property.
 */
const KNOWN: Record<string, [number, number]> = {
  'agdal': [33.995, -6.851], 'hay-riad': [33.958, -6.874], 'souissi': [33.972, -6.830], 'hassan': [34.019, -6.832],
  'ocean': [34.019, -6.849], 'l-ocean': [34.019, -6.849], 'medina': [34.025, -6.836], 'kasbah-des-oudayas': [34.031, -6.836],
  'les-orangers': [34.012, -6.843], 'aviation': [33.990, -6.866], 'hay-nahda': [33.977, -6.885], 'akkari': [34.007, -6.856],
  'yacoub-el-mansour': [34.003, -6.873], 'bir-kacem': [33.948, -6.826], 'harhoura': [33.951, -6.972], 'temara': [33.928, -6.906],
  'wifak': [33.917, -6.918], 'guich-oudaya': [33.948, -6.900], 'skhirat': [33.857, -7.035], 'plage': [33.857, -7.040],
  'sale': [34.037, -6.799], 'prestigia': [34.031, -6.761], 'sala-al-jadida': [34.000, -6.745], 'tabriquet': [34.050, -6.810],
  'centre-ville': [34.016, -6.836], 'mabella': [34.024, -6.857],
};

/** Short price for a pin: 2,35 M, 850k, 6,5k / mois. */
function pinPrice(p: PublicCard): string {
  if (p.price_cents === null) return t('Price on request');
  const dh = p.price_cents / 100;
  const n = dh >= 1_000_000 ? `${String(Math.round(dh / 10_000) / 100).replace('.', ',')} M` : dh >= 10_000 ? `${Math.round(dh / 1000)}k` : dh.toLocaleString('fr-FR');
  return `${n} DH${p.purpose === 'rent_long' ? ` ${t('/ month')}` : p.purpose === 'rent_short' ? ` ${t('/ night')}` : ''}`;
}

/** Several properties in one neighborhood: fan the pins out around its center, so each price stays readable. */
function fan(i: number, n: number): { dx: number; dy: number } {
  if (n === 1) return { dx: 0, dy: 0 };
  const cols = Math.min(n, 3);
  const row = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, n - row * cols);
  return { dx: (col - (inRow - 1) / 2) * 96, dy: row * 40 - (Math.ceil(n / cols) - 1) * 20 };
}

/** The listings on a map: one price pin per property at its neighborhood; tap a pin to see the property. */
export function ListingMap({ slug, list, points, dark }: {
  slug: string; list: PublicCard[]; points: Record<string, [number, number]>; dark: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [height] = useState(() => (window.innerWidth < 640 ? Math.max(420, Math.round(window.innerHeight * 0.68)) : 560));
  const own = useMemo(() => Object.fromEntries(Object.entries(points).map(([k, v]) => [areaSlug(k), v])), [points]);

  const { pins, missing } = useMemo(() => {
    const groups = new Map<string, { at: [number, number]; items: PublicCard[] }>();
    let missing = 0;
    for (const p of list) {
      const keys = [p.neighborhood, p.city].filter(Boolean).map(x => areaSlug(x as string));
      const key = keys.find(k => own[k] || KNOWN[k]);
      if (!key) { missing++; continue; }
      const g = groups.get(key) ?? { at: own[key] ?? KNOWN[key], items: [] };
      g.items.push(p); groups.set(key, g);
    }
    const pins: MapPoint[] = [];
    for (const g of groups.values()) {
      g.items.forEach((p, i) => pins.push({
        id: p.reference, lat: g.at[0], lng: g.at[1], ...fan(i, g.items.length), price: true,
        label: pinPrice(p), active: active === p.reference, onClick: () => setActive(a => (a === p.reference ? null : p.reference)),
      }));
    }
    return { pins, missing };
  }, [list, own, active]);

  const sel = active ? list.find(p => p.reference === active) ?? null : null;
  const place = sel ? placeText(sel) : '';

  return (
    <div className="mt-5">
      <div className="relative">
        <TileMap points={pins} height={height} dark={dark} onBackground={() => setActive(null)} />
        {sel && (
          <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-md sm:start-4 sm:end-auto sm:w-[26rem]">
            <div className="relative flex overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line/10">
              <Link to={propertyPath(slug, sel.reference)} className="group flex min-w-0 flex-1">
                <span className="relative block w-32 shrink-0 bg-surface-3 sm:w-40">
                  {sel.cover
                    ? <img src={photoUrl(sel.cover, true)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    : <span className="night grid h-full w-full place-items-center"><PropertyIcon type={sel.property_type} className="h-8 w-8 text-white/80" /></span>}
                </span>
                <span className="min-w-0 flex-1 p-3.5 pe-10">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-brand">{purposeLabel(sel.purpose)}</span>
                  <span className="mt-0.5 block font-display tabular text-lg font-bold leading-tight">{formatMad(sel.price_cents)} <span className="text-xs font-normal text-muted">{priceSuffix(sel.purpose)}</span></span>
                  <span className="mt-0.5 block truncate text-sm font-semibold group-hover:text-brand">{sel.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
                    {sel.bedrooms !== null && sel.bedrooms > 0 && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{sel.bedrooms}</span>}
                    {sel.area_m2 !== null && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{Number(sel.area_m2)} m²</span>}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand">{t('View the property')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></span>
                </span>
              </Link>
              <button type="button" onClick={() => setActive(null)} aria-label={t('Close')}
                className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"><X className="h-4 w-4" /></button>
              <span className="absolute bottom-2 end-2 [&>button]:static [&>button]:h-8 [&>button]:w-8"><FavButton slug={slug} reference={sel.reference} /></span>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        {t('Each property is shown in its neighborhood. The exact address is shared by the agent.')}
        {missing > 0 && ` ${t('{n} without a neighborhood on the map.', { n: missing })}`}
      </p>
    </div>
  );
}
