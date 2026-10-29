import { useEffect, type ReactNode } from 'react';
import { themeName, themeVars, type SiteStyle } from '../lib/theme';
import { photoUrl, type PublicOffice } from '../lib/api';
import { SiteHeader } from './SiteHeader';
import { applyLang, getLang, LANGS, saveLang, t, type Lang } from '../lib/i18n';
import { AmplifyLogo, AmplifyMark } from './Brand';
import { Link, officePath } from '../lib/router';

function LangSwitch({ langs = LANGS }: { langs?: { id: Lang; name: string }[] }) {
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
      {langs.map(l => (
        <button key={l.id} type="button" onClick={() => choose(l.id)} aria-pressed={getLang() === l.id} lang={l.id} title={l.name}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${getLang() === l.id ? 'bg-white text-night' : 'text-white/70 ring-1 ring-white/15 hover:text-white'}`}>
          {langs.length > 3 ? l.id.toUpperCase() : l.name}
        </button>
      ))}
    </div>
  );
}

/** Header (office name or the Amplify logo, language), the page, and a small footer. */
/** The office website the visitor is on, so a page that is still loading keeps the same header and style. */
export let lastSite: { site: PublicOffice; brand: SiteStyle | null } | null = null;

export function Layout({ office, stickyBar, children, langs, wide, brand, flush, site }: {
  office?: { name: string; slug: string; city: string | null }; stickyBar?: boolean; children: ReactNode; langs?: { id: Lang; name: string }[]; wide?: boolean;
  /** the style the office chose in Amplify Vitrine */ brand?: SiteStyle | null;
  /** the page starts right under the header (a full-width photo) */ flush?: boolean;
  /** an office website page (Amplify Vitrine): the full header with menu */ site?: PublicOffice;
}) {
  const theme = themeName(brand);
  if (site) lastSite = { site, brand: brand ?? null };
  // the area around the page (overscroll on a phone) takes the color of the style too
  useEffect(() => {
    document.body.style.background = theme === 'noir' ? 'rgb(12 16 22)' : theme === 'riad' ? 'rgb(250 246 240)' : '';
    return () => { document.body.style.background = ''; };
  }, [theme]);
  return (
    <div className={`themed flex min-h-screen flex-col bg-bg text-ink theme-${theme} ${site ? 'site-mode' : ''}`} style={themeVars(brand)}>
      {site ? <SiteHeader office={site} overlay={!!flush} /> : (
      <header className="night px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className={`mx-auto flex w-full ${wide ? 'max-w-6xl' : 'max-w-4xl'} items-center justify-between gap-3`}>
          {office ? (
            <Link to={officePath(office.slug)} className="flex min-w-0 items-center gap-2.5">
              {brand?.logo
                ? <span className="grid h-10 shrink-0 place-items-center rounded-xl bg-white px-2"><img src={photoUrl(brand.logo, true)} alt="" className="max-h-8 max-w-[120px] object-contain" /></span>
                : <AmplifyMark className="h-6 w-9 shrink-0" />}
              <span className="min-w-0">
                <span className="block truncate font-display text-base font-bold leading-tight">{office.name}</span>
                {office.city && <span className="block truncate text-xs text-white/65">{office.city}</span>}
              </span>
            </Link>
          ) : <AmplifyLogo size="sm" />}
          <LangSwitch langs={langs} />
        </div>
      </header>)}
      <main className={`flex-1 ${flush ? '' : 'pb-6'}`}>{children}</main>
      <footer className={`px-4 pb-6 text-center text-xs text-muted ${stickyBar ? 'footer-bar' : ''}`}>
        {t('Powered by Amplify Real Estate')}
      </footer>
    </div>
  );
}
