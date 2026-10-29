import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, X, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';
import { photoUrl } from '../lib/api';
import { t } from '../lib/i18n';

export type LightboxCta = { price: string; suffix?: string; href: string; onClick?: () => void };

const MAX_ZOOM = 4;

/**
 * Full screen photos: swipe (the photo follows the finger), pinch or double tap to zoom, drag down to close,
 * thumbnails at the bottom and, if given, a bar with the price and WhatsApp so the visitor can ask right away.
 */
export function Lightbox({ photos, title, start, onClose, cta }: {
  photos: string[]; title: string; start: number; onClose: () => void; cta?: LightboxCta;
}) {
  const n = photos.length;
  const [i, setI] = useState(start);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; t: number; px: number; py: number; dist: number; z: number; axis: 'x' | 'y' | null } | null>(null);
  const lastTap = useRef(0);

  const go = useCallback((d: number) => {
    setZoom(1); setPan({ x: 0, y: 0 });
    setI(x => Math.max(0, Math.min(n - 1, x + d)));
  }, [n]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [go, onClose]);

  // keep the active thumbnail in view
  useEffect(() => {
    const el = thumbs.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [i]);

  const dist = () => { const [a, b] = [...pts.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.current = { x: e.clientX, y: e.clientY, t: Date.now(), px: pan.x, py: pan.y, dist: dist(), z: zoom, axis: null };
    setDragging(true);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current; if (!s || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) { // pinch
      const d = dist();
      if (s.dist > 0) setZoom(Math.max(1, Math.min(MAX_ZOOM, (s.z * d) / s.dist)));
      else g.current = { ...s, dist: d, z: zoom };
      return;
    }
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (zoom > 1) { setPan({ x: s.px + mx, y: s.py + my }); return; }
    if (!s.axis && Math.abs(mx) + Math.abs(my) > 8) s.axis = Math.abs(mx) >= Math.abs(my) ? 'x' : 'y';
    if (s.axis === 'x') setDx(mx);
    if (s.axis === 'y') setDy(Math.max(0, my));
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size > 0) { if (s) g.current = { ...s, dist: 0, z: zoom, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; return; }
    g.current = null; setDragging(false);
    if (!s) return;
    const w = stage.current?.clientWidth ?? window.innerWidth;
    const quick = Date.now() - s.t < 260;
    if (s.axis === 'x') {
      if (dx < -w * 0.18 || (quick && dx < -40)) go(1);
      else if (dx > w * 0.18 || (quick && dx > 40)) go(-1);
    } else if (s.axis === 'y') {
      if (dy > 120 || (quick && dy > 60)) { onClose(); return; }
    } else if (zoom <= 1 || Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 8) {
      // a tap: two taps close together zoom in or out
      const now = Date.now();
      if (now - lastTap.current < 300) { toggleZoom(); lastTap.current = 0; return; }
      lastTap.current = now;
    }
    setDx(0); setDy(0);
    if (zoom <= 1.02) { setZoom(1); setPan({ x: 0, y: 0 }); }
  };
  const toggleZoom = () => { if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); } else setZoom(2.5); };

  const fade = Math.max(0.35, 1 - dy / 400);
  const anim = dragging ? 'none' : 'transform 380ms cubic-bezier(.22,1,.36,1)';

  // through a portal on the body, so no parent with a transform or a stacking order can cover or clip it
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex flex-col text-white" dir="ltr"
      style={{ background: `rgba(0,0,0,${fade})` }}>
      {/* top: counter, title, zoom, close */}
      <div className="relative z-10 flex items-center gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5" style={{ opacity: fade }}>
        <span className="tabular rounded-full bg-white/12 px-3 py-1 text-sm font-semibold">{i + 1} / {n}</span>
        <p className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-white/80 sm:block">{title}</p>
        <span className="flex-1 sm:hidden" />
        <button type="button" onClick={toggleZoom} aria-label={zoom > 1 ? t('Zoom out') : t('Zoom in')}
          className="hidden h-10 w-10 place-items-center rounded-full bg-white/12 transition hover:bg-white/20 sm:grid">
          {zoom > 1 ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onClose} aria-label={t('Close')} className="grid h-10 w-10 place-items-center rounded-full bg-white/12 transition hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>

      {/* the photos */}
      <div ref={stage} className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="flex h-full" style={{ transform: `translate3d(calc(${-i * 100}% + ${dx}px), ${dy}px, 0)`, transition: anim }}>
          {photos.map((b, k) => (
            <div key={b} className="grid h-full w-full shrink-0 place-items-center px-0 sm:px-16">
              {Math.abs(k - i) <= 1 && (
                <img src={photoUrl(b)} alt={`${title} · ${k + 1}/${n}`} draggable={false}
                  className="max-h-full max-w-full object-contain"
                  style={k === i ? { transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transition: dragging ? 'none' : 'transform 250ms ease-out' } : undefined} />
              )}
            </div>
          ))}
        </div>
        {n > 1 && <>
          <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label={t('Previous')}
            className="absolute start-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur transition hover:bg-white/25 disabled:opacity-0 sm:grid"><ChevronLeft className="h-6 w-6" /></button>
          <button type="button" onClick={() => go(1)} disabled={i === n - 1} aria-label={t('Next')}
            className="absolute end-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur transition hover:bg-white/25 disabled:opacity-0 sm:grid"><ChevronRight className="h-6 w-6" /></button>
        </>}
      </div>

      {/* thumbnails */}
      {n > 1 && (
        <div ref={thumbs} className="flex shrink-0 justify-start gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden" style={{ opacity: fade }}>
          {photos.map((b, k) => (
            <button key={b} type="button" onClick={() => go(k - i)} aria-label={t('Photo {i} of {n}', { i: k + 1, n })} aria-current={k === i}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg transition sm:h-16 sm:w-24 ${k === i ? 'opacity-100 ring-2 ring-white' : 'opacity-45 hover:opacity-80'}`}>
              <img src={photoUrl(b, true)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ask right away */}
      {cta && (
        <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md" style={{ opacity: fade }}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="min-w-0">
              <span className="whitespace-nowrap font-display tabular text-xl font-bold">{cta.price}</span>
              {cta.suffix && <span className="ms-1 text-sm text-white/70">{cta.suffix}</span>}
              <span className="block truncate text-xs text-white/60">{title}</span>
            </p>
            <a href={cta.href} target="_blank" rel="noreferrer" onClick={cta.onClick}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white transition hover:brightness-95">
              <MessageCircle className="h-4 w-4" /> {t('Ask on WhatsApp')}
            </a>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
