import type { ReactNode } from 'react';
import { getLang } from '../lib/i18n';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** A day as a big headline: the weekday on its own, the date under it ("Tuesday" / "3 November"). */
export function bigDay(d: Date) {
  const loc = LOCALES[getLang()];
  return {
    weekday: new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(d),
    date: new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }).format(d),
  };
}

/** The sound bars of the Amplify mark, as a quiet pattern. */
export function BarsMotif({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const heights = [14, 24, 36, 52, 72];
  return (
    <svg viewBox="0 0 84 76" className={className} aria-hidden="true">
      {heights.map((h, i) => (
        <rect key={i} x={i * 17} y={76 - h} width="11" height={h} rx="3"
          fill={i === heights.length - 1 ? '#05B962' : tone === 'dark' ? '#FFFFFF' : '#001E3E'}
          opacity={i === heights.length - 1 ? 0.9 : tone === 'dark' ? 0.1 + i * 0.03 : 0.08 + i * 0.03} />
      ))}
    </svg>
  );
}

export type HeroStat = { value: ReactNode; label: string; warn?: boolean };

/** Phone and tablet only: the navy header grows into a hero with the headline of the screen and 2 or 3 numbers.
 *  The page content then slides over it as a sheet (PhoneSheet). */
export function Hero({ eyebrow, title, sub, action, stats, children }: {
  eyebrow?: ReactNode; title: string; sub?: string; action?: ReactNode; stats?: HeroStat[]; children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-night px-4 pb-10 pt-1 text-white sm:px-6 lg:hidden">
      <span className="hero-glow" aria-hidden="true" />
      <BarsMotif className="pointer-events-none absolute end-4 top-3 h-[4.5rem] w-20 rtl:-scale-x-100" />
      <div className="relative">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-white/55">{eyebrow}</div>}
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="lg-h truncate text-[2.75rem]">{title}</h2>
            {sub && <p className="mt-1.5 text-sm font-medium text-white/65">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            {stats.map(s => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
                <p className={`tabular font-display truncate text-xl font-bold leading-tight ${s.warn ? 'text-[#FFB547]' : ''}`}>{s.value}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-tight text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** The page content on a phone: a darker cool background, with rounded top corners that slide over the hero. */
export function PhoneSheet({ children }: { children: ReactNode }) {
  return <div className="relative z-10 max-lg:-mt-6 max-lg:rounded-t-[1.75rem] max-lg:bg-bg max-lg:shadow-[0_-14px_30px_-14px_rgb(0_0_0/.45)] lg:contents">{children}</div>;
}
