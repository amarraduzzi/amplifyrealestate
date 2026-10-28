import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { getLang } from './i18n';

// A very small router: /  ->  /:office  ->  /:office/:reference. No extra library needed.

export type Route =
  | { kind: 'home' }
  | { kind: 'office'; slug: string }
  | { kind: 'property'; slug: string; reference: string }
  | { kind: 'owner'; token: string }
  | { kind: 'resident'; token: string }
  | { kind: 'project'; slug: string; project: string };

// On an office's own domain (www.atlas-immo.ma) the office is the whole site: / is the office, /P-AB12 a property.
let domainSlug: string | null = null;
export const setDomainSlug = (s: string | null) => { domainSlug = s; };
export const getDomainSlug = () => domainSlug;

/** Address of an office page and of a property page, the short way on the office's own domain. */
export const officePath = (slug: string) => (domainSlug === slug ? '/' : `/${slug}`);
export const projectPath = (slug: string, project: string) => (domainSlug === slug ? `/projet/${project}` : `/${slug}/projet/${project}`);
export const propertyPath = (slug: string, reference: string) =>
  domainSlug === slug ? `/${encodeURIComponent(reference)}` : `/${slug}/${encodeURIComponent(reference)}`;

export function parse(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
  // /o/<code>: the owner portal (no office can be called "o": office codes have at least 3 characters)
  if (parts[0] === 'o' && parts.length === 2) return { kind: 'owner', token: parts[1] };
  // /r/<code>: the co-owner page of a residence managed by a syndic
  if (parts[0] === 'r' && parts.length === 2) return { kind: 'resident', token: parts[1] };
  // /<office>/projet/<project> (or /projet/<project> on the office's own domain): a new-build project
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

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', on);
    window.addEventListener(NAV, on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener(NAV, on); };
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
    window.history.pushState(null, '', href);
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event(NAV));
  };
  return <a {...rest} href={href} onClick={go} />;
}
