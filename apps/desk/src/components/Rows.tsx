import type { CSSProperties, ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'danger' | 'brand' | 'muted';
const BAR: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', brand: 'bg-brand', muted: 'bg-surface-3' };

/** A list row that opens a detail: a colored bar on the start edge says at a glance how it stands (late, ending, fine). */
export function AccentRow({ tone, index = 0, label, onOpen, children }: { tone: Tone; index?: number; label: string; onOpen: () => void; children: ReactNode }) {
  return (
    <li role="button" tabIndex={0} aria-label={label} onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      style={{ '--i': index } as CSSProperties}
      className="card rise relative min-w-0 cursor-pointer overflow-hidden rounded-2xl p-4 ps-5 outline-none transition active:scale-[.985] hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5 sm:ps-6">
      <span aria-hidden="true" className={`absolute inset-y-0 start-0 w-1.5 ${BAR[tone]}`} />
      {children}
    </li>
  );
}

/** Phone only: what needs attention, in one line each. The numbers that are in the hero are not repeated. */
export function Attention({ items }: { items: { tone: 'danger' | 'warn'; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 lg:hidden">
      {items.map(i => (
        <p key={i.text} className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold ${i.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-current" />{i.text}
        </p>
      ))}
    </div>
  );
}

export function Progress({ pct, tone = 'ok' }: { pct: number; tone?: Tone }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3" role="presentation">
      <span className={`block h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}
