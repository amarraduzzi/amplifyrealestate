import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { t } from '../lib/i18n';

// Open modals, last one on top: Escape only closes the top one (a viewing opened from a lead, for example).
const openModals: symbol[] = [];

export function Modal({ title, sub, action, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = Symbol('modal');
    openModals.push(id);
    document.body.style.overflow = 'hidden'; // the page behind stays put
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && openModals[openModals.length - 1] === id) closeRef.current(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); const i = openModals.indexOf(id); if (i >= 0) openModals.splice(i, 1); if (openModals.length === 0) document.body.style.overflow = ''; };
  }, []);
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-night/50 backdrop-blur-[2px] sm:items-center sm:p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true"
        // phone: swipe in from the edge to go back, like a native app
        onTouchStart={e => { const x = e.touches[0].clientX; const rtl = document.dir === 'rtl'; const edge = rtl ? window.innerWidth - x : x; swipe.current = window.innerWidth < 640 && edge < 28 ? { x, y: e.touches[0].clientY } : null; }}
        onTouchEnd={e => { const s0 = swipe.current; swipe.current = null; if (!s0) return; const c = e.changedTouches[0]; const dx = (c.clientX - s0.x) * (document.dir === 'rtl' ? -1 : 1); if (dx > 70 && Math.abs(c.clientY - s0.y) < 60) onClose(); }}
        className="page-in flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-surface sm:h-auto sm:max-h-full sm:rounded-3xl sm:shadow-2xl">
        {/* phone: a page with a back arrow; tablet and up: a card with a close button */}
        <div className="flex items-center gap-1 border-b border-line/[0.07] bg-surface px-1.5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] max-sm:border-transparent max-sm:bg-night max-sm:pb-6 max-sm:text-white sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
          <button onClick={onClose} aria-label={t('Close')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/10 sm:hidden">
            <ChevronLeft className="h-6 w-6 rtl:hidden" /><ChevronRight className="hidden h-6 w-6 rtl:block" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="modal-title font-display truncate text-lg font-semibold sm:text-xl">{title}</h2>
            {sub && <p className="truncate text-sm font-medium text-white/70 sm:text-muted">{sub}</p>}
          </div>
          {action && <div className="shrink-0 pe-2 sm:hidden">{action}</div>}
          <button onClick={onClose} aria-label={t('Close')} className="hidden h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink sm:grid"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative flex-1 overflow-y-auto bg-surface px-4 py-4 max-sm:-mt-4 max-sm:rounded-t-[1.5rem] max-sm:pt-5 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="border-t border-line/[0.07] bg-surface-2/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">{footer}</div>}
      </div>
    </div>
  ), document.body);
}

type Tone = 'brand' | 'plain' | 'ghost' | 'danger';
const T: Record<Tone, string> = {
  brand: 'gold-fill text-brand-ink hover:brightness-105',
  plain: 'bg-surface-2 text-ink hover:bg-surface-3',
  ghost: 'border border-line/[0.12] bg-surface text-ink hover:bg-surface-2',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
};
export function Btn({ tone = 'plain', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition active:scale-[.98] sm:px-4 disabled:pointer-events-none disabled:opacity-40 ${T[tone]} ${className}`} />;
}

export const inputCls = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-surface-2 disabled:text-muted';

/** A labelled control. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card rounded-2xl p-4 sm:rounded-3xl sm:p-6 ${className}`}>{children}</div>;
}
