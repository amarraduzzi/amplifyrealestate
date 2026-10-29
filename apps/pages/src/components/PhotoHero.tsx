import { useRef, useState, type ReactNode } from 'react';
import { Grid2x2, ImageOff } from 'lucide-react';
import { photoUrl } from '../lib/api';
import { Lightbox, type LightboxCta } from './Lightbox';
import { t } from '../lib/i18n';

const rtl = () => document.documentElement.dir === 'rtl';

/** No photos yet: a calm placeholder instead of an empty block. */
function NoPhotos({ icon, className = '' }: { icon: ReactNode; className?: string }) {
  return (
    <div className={`grid place-items-center rounded-3xl bg-surface-2 text-muted ring-1 ring-line/10 ${className}`}>
      <span className="flex flex-col items-center gap-2 text-sm font-semibold">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-brand ring-1 ring-line/10">{icon}</span>
        <span className="inline-flex items-center gap-1.5"><ImageOff className="h-4 w-4" /> {t('Photos coming soon')}</span>
      </span>
    </div>
  );
}

/**
 * Direction 1, photos first: on a computer one large photo with up to four small ones next to it; on a phone the
 * photos side by side to swipe. A tap opens them full screen.
 */
export function PhotoMosaic({ photos, title, icon, className = '', cta }: { photos: string[]; title: string; icon: ReactNode; className?: string; cta?: LightboxCta }) {
  const [open, setOpen] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const n = photos.length;
  if (n === 0) return <NoPhotos icon={icon} className={`aspect-[16/10] sm:aspect-[21/9] ${className}`} />;
  const side = photos.slice(1, 5);
  return (
    <section aria-label={t('Photos')} className={className}>
      {/* phone: swipe */}
      <div className="relative -mx-4 sm:hidden">
        <div ref={strip} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={e => { const el = e.currentTarget; setI(Math.round(Math.abs(el.scrollLeft) / el.clientWidth)); }}>
          {photos.map((b, k) => (
            <button key={b} type="button" onClick={() => setOpen(k)} className="w-full shrink-0 snap-center" aria-label={t('Photo {i} of {n}', { i: k + 1, n })}>
              <img src={photoUrl(b)} alt={`${title} · ${k + 1}/${n}`} loading={k ? 'lazy' : 'eager'} className="aspect-[4/3] w-full object-cover" />
            </button>
          ))}
        </div>
        {n > 1 && <span className="tabular absolute bottom-3 end-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">{i + 1} / {n}</span>}
      </div>
      {/* computer: mosaic */}
      <div className={`hidden gap-2 overflow-hidden rounded-3xl sm:grid ${side.length ? 'sm:grid-cols-4 sm:grid-rows-2' : ''} sm:h-[26rem] lg:h-[30rem]`}>
        <button type="button" onClick={() => setOpen(0)} className={`group relative overflow-hidden bg-surface-3 ${side.length ? 'col-span-2 row-span-2' : ''}`} aria-label={t('Photo {i} of {n}', { i: 1, n })}>
          <img src={photoUrl(photos[0])} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
        </button>
        {side.map((b, k) => (
          <button key={b} type="button" onClick={() => setOpen(k + 1)}
            className={`group relative overflow-hidden bg-surface-3 ${side.length === 1 ? 'col-span-2 row-span-2' : side.length === 2 ? 'col-span-2' : side.length === 3 && k === 2 ? 'col-span-2' : ''}`}
            aria-label={t('Photo {i} of {n}', { i: k + 2, n })}>
            <img src={photoUrl(b, true)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          </button>
        ))}
      </div>
      {n > 1 && (
        <button type="button" onClick={() => setOpen(0)} className="mt-2 hidden items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line/10 hover:bg-surface-2 sm:inline-flex">
          <Grid2x2 className="h-3.5 w-3.5" /> {t('See the {n} photos', { n })}
        </button>
      )}
      {open !== null && <Lightbox photos={photos} title={title} start={open} onClose={() => setOpen(null)} cta={cta} />}
    </section>
  );
}

/**
 * Direction 3, for short stays on a phone: the photos fill the screen like a story, with the price and the key facts
 * on the photo. Tap the right half for the next photo, the left half for the previous one.
 */
export function StoryHero({ photos, title, icon, price, facts, place, onBook, cta }: {
  photos: string[]; title: string; icon: ReactNode; price: string; facts: string[]; place: string | null; onBook: () => void; cta?: LightboxCta;
}) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const n = photos.length;
  const touch = useRef<number | null>(null);
  const go = (d: number) => setI(x => Math.min(n - 1, Math.max(0, x + d)));
  if (n === 0) return null;
  return (
    <section className="relative -mx-4 -mt-5 h-[78svh] min-h-[28rem] overflow-hidden bg-black sm:hidden"
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 40) go((dx < 0 ? 1 : -1) * (rtl() ? -1 : 1)); }}>
      <img src={photoUrl(photos[i])} alt={`${title} · ${i + 1}/${n}`} className="absolute inset-0 h-full w-full object-cover" />
      {/* progress like a story */}
      {n > 1 && (
        <div className="absolute inset-x-3 top-3 flex gap-1" dir="ltr">
          {photos.map((_, k) => <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? 'bg-white' : 'bg-white/35'}`} />)}
        </div>
      )}
      <button type="button" aria-label={t('Previous')} onClick={() => go(rtl() ? 1 : -1)} className="absolute inset-y-0 start-0 w-1/3" />
      <button type="button" aria-label={t('Next')} onClick={() => go(rtl() ? -1 : 1)} className="absolute inset-y-0 end-0 w-1/3" />
      <button type="button" onClick={() => setOpen(true)} aria-label={t('See the {n} photos', { n })} className="absolute end-3 top-6 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white"><Grid2x2 className="h-4 w-4" /></button>
      <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/55 p-4 text-white backdrop-blur-md">
        <p className="flex items-baseline gap-1.5"><span className="font-display tabular text-3xl font-bold">{price}</span><span className="text-sm text-white/75">{t('/ night')}</span></p>
        <h1 className="mt-1 font-display text-lg font-bold leading-snug">{title}</h1>
        {place && <p className="text-sm text-white/75">{place}</p>}
        {facts.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{facts.map(f => <span key={f} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">{f}</span>)}</p>}
        <button type="button" onClick={onBook} className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-ink">{t('See the free dates')}</button>
      </div>
      <span className="sr-only">{icon}</span>
      {open && <Lightbox photos={photos} title={title} start={i} onClose={() => setOpen(false)} cta={cta} />}
    </section>
  );
}
