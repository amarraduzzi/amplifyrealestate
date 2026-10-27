// Left side of the login screen, in the style of the other Amplify apps: loud condensed headline on navy.
import { AmplifyLogo } from './Brand';
import { t } from '../lib/i18n';

const Check = () => (
  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#05B962] text-[#001E3E]">
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M5 12l4 4 10-10" /></svg>
  </span>
);

export const promises = () => [
  t('All your properties in one place'),
  t('Every price and status change is recorded'),
  t('Made for agents and agencies in Morocco'),
];

export function Showcase() {
  return (
    <section className="lg-show relative flex shrink-0 flex-col justify-between gap-6 overflow-hidden px-5 pb-14 pt-[max(1.25rem,env(safe-area-inset-top))] text-white lg:flex-1 lg:gap-0 lg:p-12">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_60%,rgba(5,185,98,.22),transparent_70%),radial-gradient(40%_40%_at_0%_0%,rgba(5,185,98,.12),transparent_70%)]" />
      <span className="lg-grid pointer-events-none absolute inset-0" />

      <div className="relative z-20 flex items-center justify-between gap-3">
        <AmplifyLogo className="min-w-0 lg:hidden" /><AmplifyLogo size="lg" className="hidden lg:flex" />
      </div>

      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold ring-1 ring-white/15">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#05B962] opacity-60" /><span className="relative h-2 w-2 rounded-full bg-[#05B962]" /></span>
          {t('Made for Morocco')}
        </p>
        <h2 className="lg-h mt-4 text-[2.9rem] lg:mt-6 lg:text-[clamp(3.4rem,5.6vw,6rem)]">
          <span className="block overflow-hidden"><span className="lg-rise block">{t('Every property.')}</span></span>
          <span className="block overflow-hidden"><span className="lg-rise block text-[#05B962]" style={{ animationDelay: '.12s' }}>{t('One place.')}</span></span>
        </h2>
        <ul className="mt-8 hidden space-y-2.5 text-white/80 lg:block">
          {promises().map((x, i) => (
            <li key={x} className="lg-in flex items-center gap-3" style={{ animationDelay: `${.3 + i * .1}s` }}><Check />{x}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
