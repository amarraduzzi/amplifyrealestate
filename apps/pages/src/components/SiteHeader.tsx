import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, MessageCircle, Phone, X } from 'lucide-react';
import type { DealPurpose } from '@vastgoed/shared';
import { logEvent, photoUrl, type PublicOffice } from '../lib/api';
import { applyLang, getLang, LANGS, saveLang, t, type Lang } from '../lib/i18n';
import { telLink, waLink } from '../lib/contact';
import { blogPath, estimationPath, navigate, officePath } from '../lib/router';
import { AmplifyMark } from './Brand';

/** What the office page knows about the site, so the menu only shows what exists. */
const known = new Map<string, { blog: boolean; areas: boolean }>();
export const rememberSite = (slug: string, info: { blog: boolean; areas: boolean }) => { known.set(slug, info); };

/** A section of the office page to open after navigating there (listings with a filter, neighborhoods, contact). */
let pending: { section: string; purpose?: DealPurpose } | null = null;
export const takePending = () => { const p = pending; pending = null; return p; };
export const SECTION_EVENT = 'pages:section';

function goSection(slug: string, section: string, purpose?: DealPurpose) {
  const here = window.location.pathname.replace(/\/+$/, '') === officePath(slug).replace(/\/+$/, '') || (officePath(slug) === '/' && window.location.pathname === '/');
  if (here) { window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: { section, purpose } })); return; }
  pending = { section, purpose };
  navigate(officePath(slug));
}

function LangMenu({ light }: { light: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const choose = (l: Lang) => {
    setOpen(false);
    if (l === getLang()) return;
    applyLang(l); saveLang(l);
    const u = new URL(window.location.href); u.searchParams.set('lang', l); window.history.replaceState(null, '', u);
    window.dispatchEvent(new Event('pages:lang'));
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={t('Language')}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${light ? 'text-white ring-white/30 hover:bg-white/10' : 'text-white ring-white/20 hover:bg-white/10'}`}>
        {getLang().toUpperCase()}<ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <ul role="listbox" className="absolute end-0 top-full z-50 mt-2 min-w-[9rem] overflow-hidden rounded-xl bg-surface py-1 text-ink shadow-xl ring-1 ring-line/10">
          {LANGS.map(l => (
            <li key={l.id}><button type="button" role="option" aria-selected={getLang() === l.id} lang={l.id} onClick={() => choose(l.id)}
              className={`block w-full px-4 py-2 text-start text-sm ${getLang() === l.id ? 'font-bold text-brand' : 'hover:bg-surface-2'}`}>{l.name}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The header of an office website (Amplify Vitrine): over the large photo it is transparent, once you scroll it
 * becomes a solid bar in the color of the style. Menu in the middle, WhatsApp on the right; on a phone a full menu.
 */
export function SiteHeader({ office, overlay }: { office: PublicOffice; overlay: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

  const info = known.get(office.slug) ?? { blog: true, areas: true };
  const solo = office.edition === 'agent' && !!office.agent;
  const name = solo ? office.agent!.name : office.name;
  const hello = t('Hello, I would like information about your properties.');
  const clear = overlay && !scrolled && !open;
  const go = (f: () => void) => { setOpen(false); f(); };
  const items: { label: string; run: () => void }[] = [
    { label: t('Buy'), run: () => goSection(office.slug, 'biens', 'sale') },
    { label: t('Rent'), run: () => goSection(office.slug, 'biens', 'rent_long') },
    { label: t('Estimate my property'), run: () => navigate(estimationPath(office.slug)) },
    ...(info.areas ? [{ label: t('Neighborhoods'), run: () => goSection(office.slug, 'quartiers') }] : []),
    ...(info.blog ? [{ label: t('Blog'), run: () => navigate(blogPath(office.slug)) }] : []),
    { label: t('Contact'), run: () => goSection(office.slug, 'contact') },
  ];
  const logo = office.style?.logo;

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${clear ? 'bg-gradient-to-b from-black/45 to-transparent' : 'night shadow-lg'}`}>
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 pt-[env(safe-area-inset-top)] sm:h-[4.5rem] sm:px-6">
          <button type="button" onClick={() => go(() => { navigate(officePath(office.slug)); })} className="flex min-w-0 items-center gap-2.5 text-start text-white">
            {logo
              ? <span className="grid h-10 shrink-0 place-items-center rounded-xl bg-white px-2"><img src={photoUrl(logo, true)} alt="" className="max-h-8 max-w-[120px] object-contain" /></span>
              : <AmplifyMark className="h-6 w-9 shrink-0" />}
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold leading-tight">{name}</span>
              {office.city && <span className="block truncate text-xs text-white/70">{office.city}</span>}
            </span>
          </button>

          <nav className="ms-auto hidden items-center gap-1 lg:flex" aria-label={t('Menu')}>
            {items.map(x => (
              <button key={x.label} type="button" onClick={x.run} className="rounded-full px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white">{x.label}</button>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2 lg:ms-2">
            {office.phone && (
              <a href={telLink(office.phone)} onClick={() => logEvent(office.slug, null, 'call')} className="hidden items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white xl:inline-flex">
                <Phone className="h-4 w-4" /><span dir="ltr">{office.phone}</span>
              </a>
            )}
            {office.whatsapp && (
              <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
                className="gold-fill hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-brand-ink transition hover:brightness-105 sm:inline-flex">
                <MessageCircle className="h-4 w-4" />WhatsApp
              </a>
            )}
            <LangMenu light={clear} />
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? t('Close') : t('Menu')}
              className="grid h-10 w-10 place-items-center rounded-full text-white ring-1 ring-white/25 hover:bg-white/10 lg:hidden">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="night fixed inset-0 z-[25] flex flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24 lg:hidden">
          <nav className="flex flex-col" aria-label={t('Menu')}>
            {items.map(x => (
              <button key={x.label} type="button" onClick={() => go(x.run)} className="border-b border-white/10 py-4 text-start font-display text-2xl font-bold text-white">{x.label}</button>
            ))}
          </nav>
          <div className="mt-auto grid gap-2">
            {office.whatsapp && <a href={waLink(office.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, null, 'whatsapp')}
              className="gold-fill inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-bold text-brand-ink"><MessageCircle className="h-5 w-5" />{t('Contact on WhatsApp')}</a>}
            {office.phone && <a href={telLink(office.phone)} onClick={() => logEvent(office.slug, null, 'call')}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-bold text-white ring-1 ring-white/25"><Phone className="h-5 w-5" /><span dir="ltr">{office.phone}</span></a>}
          </div>
        </div>
      )}
      {!overlay && <div className="h-16 sm:h-[4.5rem]" aria-hidden="true" />}
    </>
  );
}
