import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { photoUrl } from '../lib/api';
import { t } from '../lib/i18n';

/** Photos of a property: one large photo you can swipe through, a row of small ones, and full screen on tap. */
export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const touch = useRef<number | null>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setI(x => (x + d + n) % n), [n]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
      if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
    };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, go]);

  if (n === 0) return null;
  const swipe = (e: React.TouchEvent) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 40 && n > 1) go((dx < 0 ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1));
  };
  const counter = t('Photo {i} of {n}', { i: i + 1, n });

  return (
    <section aria-label={t('Photos')} className="space-y-2">
      <div className="relative overflow-hidden rounded-3xl bg-surface-3" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={swipe}>
        <button type="button" onClick={() => setOpen(true)} aria-label={counter} className="block w-full">
          <img src={photoUrl(photos[i])} alt={`${title} · ${counter}`} className="aspect-[4/3] w-full object-cover" />
        </button>
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t('Previous')} className="absolute start-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
            <button type="button" onClick={() => go(1)} aria-label={t('Next')} className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></button>
            <span className="tabular absolute bottom-2 end-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">{i + 1} / {n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((b, k) => (
            <li key={b} className="shrink-0">
              <button type="button" onClick={() => setI(k)} aria-label={t('Photo {i} of {n}', { i: k + 1, n })} aria-current={k === i}
                className={`block overflow-hidden rounded-xl ring-2 transition ${k === i ? 'ring-brand' : 'ring-transparent opacity-70 hover:opacity-100'}`}>
                <img src={photoUrl(b, true)} alt="" loading="lazy" width={72} height={72} className="h-[72px] w-[72px] object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-label={counter} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setOpen(false)} onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={swipe}>
          <img src={photoUrl(photos[i])} alt={`${title} · ${counter}`} className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white"><X className="h-6 w-6" /></button>
          {n > 1 && (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); go(-1); }} aria-label={t('Previous')} className="absolute start-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronLeft className="h-6 w-6 rtl:rotate-180" /></button>
              <button type="button" onClick={e => { e.stopPropagation(); go(1); }} aria-label={t('Next')} className="absolute end-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronRight className="h-6 w-6 rtl:rotate-180" /></button>
            </>
          )}
          <span className="tabular absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">{i + 1} / {n}</span>
        </div>
      )}
    </section>
  );
}
