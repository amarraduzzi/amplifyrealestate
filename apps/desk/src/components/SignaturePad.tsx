import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

/** Sign with a finger or the mouse. onChange gets a small PNG (data URL), or null when empty. */
export function SignaturePad({ label, onChange }: { label: string; onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const has = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1b33';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext('2d')!; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!; const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!has.current) { has.current = true; setEmpty(false); }
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (has.current) onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    has.current = false; setEmpty(true); onChange(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <button type="button" onClick={clear} className="text-xs font-semibold text-muted hover:text-ink">{t('Clear')}</button>
      </div>
      <canvas ref={ref} width={600} height={220} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="h-36 w-full touch-none rounded-xl border border-dashed border-line/30 bg-white" aria-label={label} />
      {empty && <p className="mt-1 text-xs text-muted">{t('Sign in the box with a finger or the mouse.')}</p>}
    </div>
  );
}
