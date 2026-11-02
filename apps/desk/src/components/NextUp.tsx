import type { ReactNode } from 'react';
import { t } from '../lib/i18n';

/** The one thing to do now, on top of Today: a navy card with a big headline and one clear action. */
export function NextUp({ eyebrow, when, title, sub, warn, actions, onOpen, photo }: {
  eyebrow: string; when?: string; title: string; sub?: string; warn?: boolean; actions?: ReactNode; onOpen?: () => void; photo?: string;
}) {
  const body = (
    <>
      {when && <span className={`font-display tabular block text-[2rem] font-bold leading-none ${warn ? 'text-[#FFB547]' : ''}`}>{when}</span>}
      <span className={`block text-lg font-semibold leading-snug ${when ? 'mt-2' : ''}`}>{title}</span>
      {sub && <span className="mt-0.5 block text-sm text-white/65">{sub}</span>}
    </>
  );
  return (
    <section className="night rise relative mb-6 overflow-hidden rounded-3xl p-5 text-white shadow-[0_14px_30px_-14px_rgb(0_30_62/.7)] ring-1 ring-white/10" aria-label={t('Up next')}>
      {photo && (
        <>
          <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-night/95 via-night/75 to-night/35" aria-hidden="true" />
        </>
      )}
      <span className="hero-glow" aria-hidden="true" />
      <div className="relative">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/60">
          <span className="h-2 w-2 rounded-full bg-brand motion-safe:animate-pulse" aria-hidden="true" />{eyebrow}
        </p>
        {onOpen
          ? <button type="button" onClick={onOpen} className="mt-3 block w-full text-start">{body}</button>
          : <div className="mt-3">{body}</div>}
        {actions && <div className="mt-4 flex items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

/** The big green button of the card. */
export const nextPrimary = 'gold-fill inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-brand-ink transition active:scale-95 disabled:opacity-40';
/** A round button next to it. */
export const nextRound = 'grid h-12 w-12 place-items-center rounded-full bg-night-2 text-white ring-1 ring-white/20 transition active:scale-90';
