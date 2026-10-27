import type { ReactNode } from 'react';
import { applyLang, getLang, LANGS, saveLang, t, type Lang } from '../lib/i18n';
import { AmplifyLogo, AmplifyMark } from './Brand';
import { Link } from '../lib/router';

function LangSwitch() {
  const choose = (l: Lang) => {
    if (l === getLang()) return;
    applyLang(l); saveLang(l);
    const u = new URL(window.location.href);
    u.searchParams.set('lang', l);
    window.history.replaceState(null, '', u);
    window.dispatchEvent(new Event('pages:lang')); // the app listens and draws everything again
  };
  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label={t('Language')}>
      {LANGS.map(l => (
        <button key={l.id} type="button" onClick={() => choose(l.id)} aria-pressed={getLang() === l.id} lang={l.id}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${getLang() === l.id ? 'bg-white text-night' : 'text-white/70 ring-1 ring-white/15 hover:text-white'}`}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

/** Header (office name or the Amplify logo, language), the page, and a small footer. */
export function Layout({ office, stickyBar, children }: {
  office?: { name: string; slug: string; city: string | null }; stickyBar?: boolean; children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="night px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          {office ? (
            <Link to={`/${office.slug}`} className="flex min-w-0 items-center gap-2.5">
              <AmplifyMark className="h-6 w-9 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-display text-base font-bold leading-tight">{office.name}</span>
                {office.city && <span className="block truncate text-xs text-white/65">{office.city}</span>}
              </span>
            </Link>
          ) : <AmplifyLogo size="sm" />}
          <LangSwitch />
        </div>
      </header>
      <main className="flex-1 pb-6">{children}</main>
      <footer className="px-4 pb-6 text-center text-xs text-muted" style={stickyBar ? { paddingBottom: '6.5rem' } : undefined}>
        {t('Powered by Amplify Real Estate')}
      </footer>
    </div>
  );
}
