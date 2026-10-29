import { useState, type ReactNode } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { DealPurpose } from '@vastgoed/shared';
import type { PublicCard } from '../lib/api';
import { t } from '../lib/i18n';

export type Sort = 'new' | 'price_asc' | 'price_desc' | 'area_desc';
export type Filters = { sort: Sort; min: number | null; max: number | null; beds: number; area: number };
export const NO_FILTERS: Filters = { sort: 'new', min: null, max: null, beds: 0, area: 0 };

/** Budget steps in dirhams, per kind of deal. */
const STEPS: Record<DealPurpose, number[]> = {
  sale: [500_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 12_000_000],
  rent_long: [3_000, 5_000, 7_000, 10_000, 15_000, 20_000, 30_000, 50_000],
  rent_short: [500, 800, 1_200, 2_000, 3_000, 5_000],
};
const AREAS = [50, 80, 100, 150, 200, 300, 500];
const BEDS = [1, 2, 3, 4, 5];

export const short = (dh: number) => dh >= 1_000_000 ? `${String(dh / 1_000_000).replace('.', ',')} M DH`
  : dh >= 10_000 ? `${dh / 1000}k DH` : `${dh.toLocaleString('fr-FR')} DH`;

/** Applies the filters and the sort order to the listings that are already filtered on deal, type and text. */
export function applyFilters(list: PublicCard[], f: Filters, priced: boolean): PublicCard[] {
  const out = list.filter(l => {
    const dh = l.price_cents === null ? null : l.price_cents / 100;
    if (priced && f.min !== null && (dh === null || dh < f.min)) return false;
    if (priced && f.max !== null && (dh === null || dh > f.max)) return false;
    if (f.beds > 0 && (l.bedrooms ?? 0) < f.beds) return false;
    if (f.area > 0 && (l.area_m2 ?? 0) < f.area) return false;
    return true;
  });
  const price = (l: PublicCard, empty: number) => l.price_cents ?? empty;
  if (f.sort === 'price_asc') out.sort((a, b) => price(a, Infinity) - price(b, Infinity));
  if (f.sort === 'price_desc') out.sort((a, b) => price(b, -1) - price(a, -1));
  if (f.sort === 'area_desc') out.sort((a, b) => (b.area_m2 ?? 0) - (a.area_m2 ?? 0));
  return out;
}

export const activeCount = (f: Filters, priced: boolean) =>
  (priced && f.min !== null ? 1 : 0) + (priced && f.max !== null ? 1 : 0) + (f.beds > 0 ? 1 : 0) + (f.area > 0 ? 1 : 0);

const selectCls = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3 py-2 text-sm';
const chip = (on: boolean) => `min-w-[2.75rem] rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`;

/** The button with the number of active filters, the panel with budget, bedrooms and surface, and the sort order. */
export function ListingFilters({ f, setF, purpose, count, total, extra }: {
  f: Filters; setF: (f: Filters) => void; purpose: DealPurpose | null; count: number; total: number; extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const n = activeCount(f, purpose !== null);
  const steps = purpose ? STEPS[purpose] : [];
  const per = purpose === 'rent_long' ? t('/ month') : purpose === 'rent_short' ? t('/ night') : '';
  const set = (p: Partial<Filters>) => setF({ ...f, ...p });

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition ${open || n > 0 ? 'bg-ink text-bg ring-ink' : 'bg-surface text-ink ring-line/10 hover:ring-line/25'}`}>
          <SlidersHorizontal className="h-4 w-4" /> {t('Filters')}
          {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{n}</span>}
        </button>
        {n > 0 && (
          <button type="button" onClick={() => setF({ ...NO_FILTERS, sort: f.sort })} className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-muted hover:text-ink">
            <RotateCcw className="h-3.5 w-3.5" /> {t('Reset')}
          </button>
        )}
        {extra}
        <p className="text-sm text-muted" aria-live="polite">{count === total ? t('{n} properties', { n: total }) : t('{n} of {total} properties', { n: count, total })}</p>
        <label className="ms-auto flex items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">{t('Sort by')}</span>
          <select value={f.sort} onChange={e => set({ sort: e.target.value as Sort })} aria-label={t('Sort by')}
            className="rounded-xl border border-line/[0.12] bg-surface px-3 py-2 text-sm text-ink">
            <option value="new">{t('Newest')}</option>
            <option value="price_asc">{t('Price: low to high')}</option>
            <option value="price_desc">{t('Price: high to low')}</option>
            <option value="area_desc">{t('Largest first')}</option>
          </select>
        </label>
      </div>

      {open && (
        <div className="mt-3 grid gap-5 rounded-2xl bg-surface p-4 ring-1 ring-line/10 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.3fr_1fr_0.8fr]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t('Budget')} {per && <span className="normal-case tracking-normal">{per}</span>}</p>
            {purpose ? (
              <div className="grid grid-cols-2 gap-2">
                <select value={f.min ?? ''} onChange={e => set({ min: e.target.value ? Number(e.target.value) : null })} aria-label={t('Minimum')} className={selectCls}>
                  <option value="">{t('Minimum')}</option>
                  {steps.filter(s => f.max === null || s < f.max).map(s => <option key={s} value={s}>{short(s)}</option>)}
                </select>
                <select value={f.max ?? ''} onChange={e => set({ max: e.target.value ? Number(e.target.value) : null })} aria-label={t('Maximum')} className={selectCls}>
                  <option value="">{t('Maximum')}</option>
                  {steps.filter(s => f.min === null || s > f.min).map(s => <option key={s} value={s}>{short(s)}</option>)}
                </select>
              </div>
            ) : <p className="text-sm text-muted">{t('Choose Buy or Rent first to set a budget.')}</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t('Bedrooms')}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={f.beds === 0} onClick={() => set({ beds: 0 })} className={chip(f.beds === 0)}>{t('All')}</button>
              {BEDS.map(b => <button key={b} type="button" aria-pressed={f.beds === b} onClick={() => set({ beds: b })} className={chip(f.beds === b)}>{b}+</button>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t('Surface')}</p>
            <select value={f.area} onChange={e => set({ area: Number(e.target.value) })} aria-label={t('Surface')} className={selectCls}>
              <option value={0}>{t('Any size')}</option>
              {AREAS.map(a => <option key={a} value={a}>{t('From {n} m²', { n: a })}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
