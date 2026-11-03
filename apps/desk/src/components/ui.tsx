import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { t } from '../lib/i18n';
import { BarsMotif } from './Hero';

// Open modals, last one on top: Escape only closes the top one (a viewing opened from a lead, for example).
type Open = { id: symbol; close: () => void; popped: boolean };
const openModals: Open[] = [];
let ignorePops = 0;
// the phone's back button (or an edge swipe in the browser) closes the top screen instead of leaving the app
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = openModals[openModals.length - 1];
    if (top) { top.popped = true; top.close(); }
  });
}

export function Modal({ title, sub, action, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const entry: Open = { id: Symbol('modal'), close: () => closeRef.current(), popped: false };
    openModals.push(entry);
    document.body.style.overflow = 'hidden'; // the page behind stays put
    window.history.pushState({ amplifyScreen: true }, '');
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && openModals[openModals.length - 1] === entry) closeRef.current(); };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
      const n = openModals.indexOf(entry); if (n >= 0) openModals.splice(n, 1);
      if (openModals.length === 0) document.body.style.overflow = '';
      if (!entry.popped && window.history.state?.amplifyScreen) { ignorePops++; window.history.back(); }
    };
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
        <div className="relative flex-1 overflow-y-auto bg-surface px-4 py-4 max-sm:-mt-4 max-sm:rounded-t-[1.5rem] max-sm:bg-bg max-sm:pt-5 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="modal-foot border-t border-line/[0.07] bg-surface-2/50 px-4 py-3 max-sm:border-0 max-sm:bg-surface max-sm:shadow-[0_-10px_24px_-14px_rgb(0_30_62/.3)] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">{footer}</div>}
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
      <span className="field-label mb-1.5 block text-[13px] font-bold tracking-wide text-muted max-sm:uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card rounded-2xl p-4 sm:rounded-3xl sm:p-6 ${className}`}>{children}</div>;
}


/** The same empty state on every screen: the Amplify bars, an icon, what this is for, and the first action. */
export function EmptyState({ icon: Icon, title, text, action, className = 'mt-6' }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`card relative overflow-hidden rounded-3xl px-5 py-8 text-center ${className}`}>
      <BarsMotif tone="light" className="pointer-events-none absolute end-4 top-4 h-10 w-12 opacity-80" />
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon className="h-6 w-6" /></span>
      <h2 className="font-display mt-3 text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
