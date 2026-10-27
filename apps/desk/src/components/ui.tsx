import { createPortal } from 'react-dom';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/50 p-2 backdrop-blur-[2px] sm:p-3" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" className="pop flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line/[0.07] px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && <div className="border-t border-line/[0.07] bg-surface-2/50 px-4 py-3 sm:px-6 sm:py-4">{footer}</div>}
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
