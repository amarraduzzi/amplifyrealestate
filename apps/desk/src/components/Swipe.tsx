import { useRef, useState, type ReactNode } from 'react';

const REVEAL = 96;   // width of the action behind the row
const TRIGGER = 72;  // how far you must pull for the action to fire
const isRtl = () => document.documentElement.dir === 'rtl';

/** Touch only: swipe a row toward the start of the screen (to the left; in Arabic to the right) to reveal one action.
 *  Let go past the threshold and the action fires; the row then springs back. A mouse never swipes, so the computer is unchanged.
 *  Always keep a normal button for the same action inside the row: a swipe is a shortcut, not the only way. */
export function Swipe({ label, icon, tone = 'ok', disabled, onTrigger, children }: {
  label: string; icon: ReactNode; tone?: 'ok' | 'danger' | 'brand'; disabled?: boolean; onTrigger: () => void; children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const s = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const dragged = useRef(false);
  const cur = useRef(0);

  if (disabled) return <>{children}</>;

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    s.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const move = (e: React.PointerEvent) => {
    const st = s.current;
    if (!st) return;
    const rx = e.clientX - st.x, ry = e.clientY - st.y;
    if (!st.active) {
      if (Math.abs(ry) > 10 && Math.abs(ry) > Math.abs(rx)) { s.current = null; return; }   // a vertical scroll: leave it alone
      if (Math.abs(rx) < 8) return;
      st.active = true;
      setDrag(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported: the swipe still works */ }
    }
    const toward = isRtl() ? rx : -rx;
    cur.current = Math.max(0, Math.min(toward, REVEAL * 1.25));
    setDx(cur.current);
  };
  const up = () => {
    const st = s.current;
    s.current = null;
    if (!st?.active) return;
    dragged.current = true;
    setTimeout(() => { dragged.current = false; }, 60);
    const fire = cur.current >= TRIGGER;
    cur.current = 0;
    setDrag(false);
    setDx(0);
    if (fire) onTrigger();
  };

  const bg = tone === 'danger' ? 'bg-danger' : tone === 'brand' ? 'bg-brand' : 'bg-ok';
  const ready = dx >= TRIGGER;
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div aria-hidden="true" className={`absolute inset-y-0 end-0 flex w-24 items-center justify-center gap-1.5 text-sm font-bold text-white ${bg} ${ready ? '' : 'opacity-90'}`}>
        {icon}<span>{label}</span>
      </div>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={e => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); } }}
        style={{ transform: `translateX(${isRtl() ? dx : -dx}px)`, transition: drag ? 'none' : 'transform .22s cubic-bezier(.16,1,.3,1)', touchAction: 'pan-y' }}
        className="relative">
        {children}
      </div>
    </div>
  );
}
