import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const TRIGGER = 64;

/** Phone and tablet: pull the page down from the very top to load it again. Nothing happens on a computer,
 *  inside a form or while a sheet is open. */
export function PullToRefresh({ onRefresh, disabled }: { onRefresh: () => void; disabled?: boolean }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const small = () => window.matchMedia('(max-width: 1023px)').matches;
    const allowed = (t: EventTarget | null) => !(t instanceof Element && t.closest('[role="dialog"], .sheet, .report-overlay, input, textarea, select'));
    const down = (e: TouchEvent) => {
      if (!small() || window.scrollY > 0 || e.touches.length !== 1 || !allowed(e.target)) { start.current = null; return; }
      start.current = e.touches[0].clientY;
      cur.current = 0;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (window.scrollY > 0) { start.current = null; cur.current = 0; setPull(0); return; }
      if (dy <= 0) { if (cur.current) { cur.current = 0; setPull(0); } return; }
      cur.current = Math.min(dy * 0.5, 90);
      setPull(cur.current);
    };
    const end = () => {
      if (start.current === null) return;
      start.current = null;
      if (cur.current >= TRIGGER) {
        setBusy(true);
        setPull(54);
        onRefresh();
        setTimeout(() => { setBusy(false); setPull(0); }, 800);
      } else setPull(0);
      cur.current = 0;
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onRefresh, disabled]);

  if (pull === 0 && !busy) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-20 flex justify-center lg:hidden" style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 2.4rem)' }} aria-hidden="true">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-brand shadow-lg ring-1 ring-line/10"
        style={{ transform: `translateY(${pull - 34}px)`, opacity: Math.min(1, pull / 36), transition: pull === 0 || busy ? 'transform .2s, opacity .2s' : 'none' }}>
        <RefreshCw className={`h-[18px] w-[18px] ${busy ? 'animate-spin' : ''}`} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
}
