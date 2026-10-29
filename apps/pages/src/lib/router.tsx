import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { getLang } from './i18n';

// A very small router: /  ->  /:office  ->  /:office/:reference. No extra library needed.

export type Route =
  | { kind: 'home' }
  | { kind: 'office'; slug: string }
  | { kind: 'property'; slug: string; reference: string }
  | { kind: 'owner'; token: string }
  | { kind: 'resident'; token: string }
  | { kind: 'guest'; token: string }
  | { kind: 'booking'; token: string }
  | { kind: 'cleaner'; token: string }
  | { kind: 'voucher'; token: string }
  | { kind: 'estimation'; slug: string }
  | { kind: 'blog'; slug: string }
  | { kind: 'post'; slug: string; post: string }
  | { kind: 'area'; slug: string; area: string }
  | { kind: 'project'; slug: string; project: string };

// On an office's own domain (www.atlas-immo.ma) the office is the whole site: / is the office, /P-AB12 a property.
let domainSlug: string | null = null;
export const setDomainSlug = (s: string | null) => { domainSlug = s; };
export const getDomainSlug = () => domainSlug;

/** Address of an office page and of a property page, the short way on the office's own domain. */
export const officePath = (slug: string) => (domainSlug === slug ? '/' : `/${slug}`);
export const projectPath = (slug: string, project: string) => (domainSlug === slug ? `/projet/${project}` : `/${slug}/projet/${project}`);
/** "Agdal Sud" becomes "agdal-sud": the address of a neighborhood page. */
export const areaSlug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const areaPath = (slug: string, name: string) => (domainSlug === slug ? `/quartier/${areaSlug(name)}` : `/${slug}/quartier/${areaSlug(name)}`);
export const blogPath = (slug: string) => (domainSlug === slug ? '/blog' : `/${slug}/blog`);
export const postPath = (slug: string, post: string) => (domainSlug === slug ? `/blog/${post}` : `/${slug}/blog/${post}`);
export const estimationPath = (slug: string) => (domainSlug === slug ? '/estimation' : `/${slug}/estimation`);
export const propertyPath = (slug: string, reference: string) =>
  domainSlug === slug ? `/${encodeURIComponent(reference)}` : `/${slug}/${encodeURIComponent(reference)}`;

export function parse(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  // /o/<code>: the owner portal (no office can be called "o": office codes have at least 3 characters)
  if (parts[0] === 'o' && parts.length === 2) return { kind: 'owner', token: parts[1] };
  // /r/<code>: the co-owner page of a residence managed by a syndic
  if (parts[0] === 'r' && parts.length === 2) return { kind: 'resident', token: parts[1] };
  // /g/<code>: the guest page of a short-term rental. /c/<code>: the cleaning list of a cleaner
  // /b/<code>: the status of a booking request (12c)
  if (parts[0] === 'b' && parts.length === 2) return { kind: 'booking', token: parts[1] };
  // /v/<code>: the visitor's copy of a signed visit voucher (Amplify Agent)
  if (parts[0] === 'v' && parts.length === 2) return { kind: 'voucher', token: parts[1] };
  if (parts[0] === 'g' && parts.length === 2) return { kind: 'guest', token: parts[1] };
  if (parts[0] === 'c' && parts.length === 2) return { kind: 'cleaner', token: parts[1] };
  // /<office>/projet/<project> (or /projet/<project> on the office's own domain): a new-build project
  // /<office>/estimation and /<office>/quartier/<name> (Amplify Vitrine), the short way on the office's own domain
  if (domainSlug && parts.length === 1 && parts[0] === 'estimation') return { kind: 'estimation', slug: domainSlug };
  if (domainSlug && parts.length === 1 && parts[0] === 'blog') return { kind: 'blog', slug: domainSlug };
  if (domainSlug && parts.length === 2 && parts[0] === 'blog') return { kind: 'post', slug: domainSlug, post: parts[1].toLowerCase() };
  if (!domainSlug && parts.length === 2 && parts[1] === 'blog') return { kind: 'blog', slug: parts[0].toLowerCase() };
  if (!domainSlug && parts.length === 3 && parts[1] === 'blog') return { kind: 'post', slug: parts[0].toLowerCase(), post: parts[2].toLowerCase() };
  if (domainSlug && parts.length === 2 && parts[0] === 'quartier') return { kind: 'area', slug: domainSlug, area: parts[1].toLowerCase() };
  if (!domainSlug && parts.length === 2 && parts[1] === 'estimation') return { kind: 'estimation', slug: parts[0].toLowerCase() };
  if (!domainSlug && parts.length === 3 && parts[1] === 'quartier') return { kind: 'area', slug: parts[0].toLowerCase(), area: parts[2].toLowerCase() };
  if (domainSlug && parts.length === 2 && parts[0] === 'projet') return { kind: 'project', slug: domainSlug, project: parts[1].toLowerCase() };
  if (!domainSlug && parts.length === 3 && parts[1] === 'projet') return { kind: 'project', slug: parts[0].toLowerCase(), project: parts[2].toLowerCase() };
  if (domainSlug) {
    if (parts.length === 0) return { kind: 'office', slug: domainSlug };
    return { kind: 'property', slug: domainSlug, reference: parts.join('/') };
  }
  if (parts.length === 0) return { kind: 'home' };
  if (parts.length === 1) return { kind: 'office', slug: parts[0].toLowerCase() };
  // anything deeper is not a page we know: treat it as a property with an impossible reference, so it shows "not found"
  return { kind: 'property', slug: parts[0].toLowerCase(), reference: parts.length === 2 ? parts[1] : parts.join('/') };
}

const NAV = 'pages:navigate';
/** Go to a page of the site without reloading (for a tap on the map). */
export function navigate(to: string) {
  // remember where the visitor was on this page, so "back" returns to the same spot
  try { window.history.replaceState({ ...(window.history.state ?? {}), y: window.scrollY }, ''); } catch { /* ignore */ }
  window.history.pushState({ y: 0 }, '', withLang(to));
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(NAV));
}
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

/** After "back" or "forward": scroll to where the visitor was, once the page has drawn (twice, for late photos and blocks). */
function restoreScroll() {
  const y = Number((window.history.state as { y?: number } | null)?.y ?? 0);
  requestAnimationFrame(() => { window.scrollTo(0, y); window.setTimeout(() => window.scrollTo(0, y), 120); });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.pathname));
    const back = () => { on(); restoreScroll(); };
    window.addEventListener('popstate', back);
    window.addEventListener(NAV, on);
    return () => { window.removeEventListener('popstate', back); window.removeEventListener(NAV, on); };
  }, []);
  return route;
}

/** Same address, language kept in the link so a reload (or a forwarded link) stays in the same language. */
export const withLang = (path: string) => `${path}?lang=${getLang()}`;

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = withLang(to);
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...rest} href={href} onClick={go} />;
}
