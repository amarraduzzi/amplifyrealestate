import { useEffect, useRef } from 'react';

/** A photo that moves a little slower than the page while it scrolls by. Still with "reduce motion" on. */
export function ParallaxImg({ src, className = '', strength = 70 }: { src: string; className?: string; strength?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const box = el.parentElement?.getBoundingClientRect(); if (!box) return;
      const vh = window.innerHeight;
      if (box.bottom < 0 || box.top > vh) return;
      // -1 when the block enters at the bottom, +1 when it leaves at the top
      const p = ((box.top + box.height / 2) - vh / 2) / (vh / 2 + box.height / 2);
      el.style.transform = `translate3d(0, ${(p * strength).toFixed(1)}px, 0) scale(1.18)`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [strength]);
  return <img ref={ref} src={src} alt="" loading="lazy" className={`will-change-transform ${className}`} style={{ transform: 'scale(1.18)' }} />;
}
