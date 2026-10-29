import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, MapPin, Search } from 'lucide-react';
import type { DealPurpose } from '@vastgoed/shared';
import { photoUrl, type PublicCard } from '../lib/api';
import { purposeLabel } from '../lib/format';
import { Link, propertyPath } from '../lib/router';
import { t } from '../lib/i18n';
import { short } from './ListingFilters';

export type Slide = { photo: string; listing?: PublicCard };

/** The photos for the top of the page: the chosen large photo first, then the covers of the newest properties. */
export function heroSlides(hero: string | null | undefined, listings: PublicCard[], max = 4): Slide[] {
  const out: Slide[] = hero ? [{ photo: hero }] : [];
  for (const l of listings) {
    if (out.length >= max) break;
    if (l.cover && l.status === 'available' && !out.some(s => s.photo === l.cover)) out.push({ photo: l.cover, listing: l });
  }
  return out;
}

const STAY = 6500;

/** Large photos that slowly zoom and fade into each other. With "reduce motion" on, only the first photo stays. */
export function HeroBackdrop({ slides, slug }: { slides: Slide[]; slug: string }) {
  const [at, setAt] = useState(0);
  const [still] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (still || slides.length < 2) return;
    const id = window.setInterval(() => { if (!document.hidden) setAt(a => (a + 1) % slides.length); }, STAY);
    return () => window.clearInterval(id);
  }, [slides.length, still]);
  const cur = slides[at];

  return (
    <>
      <div className="absolute inset-0 -z-10 bg-night">
        {slides.map((s, i) => (
          <img key={s.photo} src={photoUrl(s.photo)} alt="" loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'low'}
            className={`kenburns absolute inset-0 h-full w-full object-cover transition-opacity duration-[1600ms] ease-in-out ${i === at ? 'opacity-100' : 'opacity-0'} ${i % 2 ? 'kb-b' : 'kb-a'}`}
            style={{ animationPlayState: i === at ? 'running' : 'paused' }} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/25" />
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-20 end-4 z-10 hidden items-center gap-3 sm:bottom-24 sm:end-6 md:flex">
          {cur.listing && (
            <Link to={propertyPath(slug, cur.listing.reference)} key={cur.photo}
              className="rise inline-flex max-w-xs items-center gap-2 rounded-full bg-black/45 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/60">
              <span className="truncate">{cur.listing.title}</span>
              {cur.listing.price_cents !== null && <span className="shrink-0 text-white/75">{short(cur.listing.price_cents / 100)}</span>}
              <ArrowRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" />
            </Link>
          )}
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button key={s.photo} type="button" onClick={() => setAt(i)} aria-label={t('Photo {n}', { n: i + 1 })}
                className="group grid h-6 place-items-center px-0.5">
                <span className={`block h-1 rounded-full bg-white transition-all duration-500 ${i === at ? 'w-8 opacity-100' : 'w-3 opacity-50 group-hover:opacity-80'}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const STEPS: Record<DealPurpose, number[]> = {
  sale: [800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000],
  rent_long: [4_000, 6_000, 8_000, 12_000, 20_000, 30_000],
  rent_short: [600, 1_000, 1_500, 2_500, 4_000],
};

/** The search on the photo: tabs for buy and rent, then neighborhood and budget, then one button. */
export function HeroSearch({ purposes, hoods, onSearch }: {
  purposes: DealPurpose[]; hoods: string[];
  onSearch: (s: { purpose: DealPurpose | 'all'; hood: string; max: number | null }) => void;
}) {
  const tabs: (DealPurpose | 'all')[] = purposes.length > 1 ? ['all', ...purposes] : purposes;
  const [deal, setDeal] = useState<DealPurpose | 'all'>(tabs[0] ?? 'all');
  const [hood, setHood] = useState('');
  const [max, setMax] = useState<number | null>(null);
  const steps = deal !== 'all' ? STEPS[deal] : [];
  const submit = (e: FormEvent) => { e.preventDefault(); onSearch({ purpose: deal, hood, max: deal !== 'all' ? max : null }); };
  const field = 'w-full appearance-none bg-transparent text-sm font-semibold text-ink outline-none';

  return (
    <form onSubmit={submit} className="mt-8 w-full max-w-3xl">
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {tabs.map(p => (
            <button key={p} type="button" role="tab" aria-selected={deal === p} onClick={() => { setDeal(p); setMax(null); }}
              className={`shrink-0 rounded-t-xl px-4 py-2.5 text-sm font-bold transition ${deal === p ? 'bg-surface text-ink' : 'bg-black/30 text-white/85 backdrop-blur-md hover:bg-black/45 hover:text-white'}`}>
              {p === 'all' ? t('All') : purposeLabel(p)}
            </button>
          ))}
        </div>
      )}
      <div className={`grid gap-1 bg-surface p-2 shadow-2xl sm:grid-cols-[1.4fr_1fr_auto] sm:items-center ${tabs.length > 1 ? 'rounded-b-2xl rounded-se-2xl' : 'rounded-2xl'}`}>
        <label className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2">
          <MapPin className="h-5 w-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{t('Neighborhood')}</span>
            <select value={hood} onChange={e => setHood(e.target.value)} className={field}>
              <option value="">{t('All neighborhoods')}</option>
              {hoods.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </span>
        </label>
        <label className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2 sm:border-s sm:border-line/10">
          <span className="grid h-5 w-5 shrink-0 place-items-center text-xs font-black text-brand">DH</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{t('Maximum budget')}</span>
            {deal === 'all'
              ? <span className="block truncate text-sm font-semibold text-muted">{t('Choose Buy or Rent')}</span>
              : (
                <select value={max ?? ''} onChange={e => setMax(e.target.value ? Number(e.target.value) : null)} className={field}>
                  <option value="">{t('No limit')}</option>
                  {steps.map(s => <option key={s} value={s}>{short(s)}{deal === 'rent_long' ? ` ${t('/ month')}` : deal === 'rent_short' ? ` ${t('/ night')}` : ''}</option>)}
                </select>
              )}
          </span>
        </label>
        <button type="submit" className="gold-fill inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-brand-ink transition hover:brightness-105">
          <Search className="h-4 w-4" /> {t('Search')}
        </button>
      </div>
    </form>
  );
}
