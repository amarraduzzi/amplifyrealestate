import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * A light map without a library: OpenStreetMap tiles, markers on top, drag to move, + and - to zoom.
 * Only neighborhoods are shown on it, never the address of a property.
 */
export type MapPoint = { id: string; lat: number; lng: number; label: ReactNode; onClick?: () => void; active?: boolean };

const TILE = 256;
const project = (lat: number, lng: number, z: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  const n = TILE * 2 ** z;
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const unproject = (x: number, y: number, z: number) => {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const m = Math.PI - (2 * Math.PI * y) / n;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m))), lng };
};

function fit(points: { lat: number; lng: number }[], w: number, h: number) {
  if (!points.length) return { lat: 33.97, lng: -6.85, z: 12 }; // Rabat
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, z: 14 };
  for (let z = 15; z >= 9; z--) {
    const ps = points.map(p => project(p.lat, p.lng, z));
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    if (Math.max(...xs) - Math.min(...xs) < w - 120 && Math.max(...ys) - Math.min(...ys) < h - 120) {
      const c = unproject((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, z);
      return { ...c, z };
    }
  }
  return { lat: points[0].lat, lng: points[0].lng, z: 9 };
}

export function TileMap({ points, height = 420, dark = false, onPick, className = '' }: {
  points: MapPoint[]; height?: number; dark?: boolean; onPick?: (lat: number, lng: number) => void; className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const key = points.map(p => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const start = useMemo(() => fit(points, w, height), [key, w, height]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState(start);
  useEffect(() => { setView(start); }, [start]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el); setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const c = project(view.lat, view.lng, view.z);
  const left = c.x - w / 2, top = c.y - height / 2;
  const tiles: { k: string; x: number; y: number; px: number; py: number }[] = [];
  const max = 2 ** view.z;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= max) continue;
      tiles.push({ k: `${view.z}/${tx}/${ty}`, x: ((tx % max) + max) % max, y: ty, px: tx * TILE - left, py: ty * TILE - top });
    }
  }

  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView(v => ({ ...unproject(d.cx - dx, d.cy - dy, v.z), z: v.z }));
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved && onPick) {
      const r = e.currentTarget.getBoundingClientRect();
      const p = unproject(left + (e.clientX - r.left), top + (e.clientY - r.top), view.z);
      onPick(Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5);
    }
  };
  const zoom = (d: 1 | -1) => setView(v => ({ ...v, z: Math.max(8, Math.min(17, v.z + d)) }));

  return (
    <div ref={box} className={`relative select-none overflow-hidden rounded-3xl bg-surface-3 ring-1 ring-line/10 ${onPick ? 'cursor-crosshair' : 'cursor-grab'} ${className}`}
      style={{ height, touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}>
      <div className="absolute inset-0" style={dark ? { filter: 'invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)' } : { filter: 'saturate(.75)' }}>
        {tiles.map(tl => (
          <img key={tl.k} src={`https://tile.openstreetmap.org/${view.z}/${tl.x}/${tl.y}.png`} alt="" draggable={false} loading="lazy"
            className="absolute h-64 w-64 max-w-none" style={{ left: tl.px, top: tl.py }} />
        ))}
      </div>
      {points.map(p => {
        const q = project(p.lat, p.lng, view.z);
        return (
          <button key={p.id} type="button" onClick={p.onClick} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: q.x - left, top: q.y - top }}>
            <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shadow-lg ring-2 ring-white transition hover:scale-105 ${p.active ? 'bg-ink text-bg' : 'gold-fill text-brand-ink'}`}>{p.label}</span>
            <span className={`mx-auto block h-2.5 w-2.5 -translate-y-0.5 rotate-45 ${p.active ? 'bg-ink' : 'bg-brand'}`} />
          </button>
        );
      })}
      <div className="absolute end-3 top-3 flex flex-col overflow-hidden rounded-xl bg-surface shadow ring-1 ring-line/10">
        <button type="button" onClick={() => zoom(1)} aria-label="+" className="grid h-9 w-9 place-items-center hover:bg-surface-2"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoom(-1)} aria-label="-" className="grid h-9 w-9 place-items-center border-t border-line/10 hover:bg-surface-2"><Minus className="h-4 w-4" /></button>
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1.5 end-2 rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-gray-700">© OpenStreetMap</a>
    </div>
  );
}
