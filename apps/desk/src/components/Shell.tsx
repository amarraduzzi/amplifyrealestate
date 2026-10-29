import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3, BedDouble, Building, Building2, FileSignature, Globe, HardHat, CalendarClock, CalendarDays, Handshake, KeyRound, LayoutGrid, LogOut, Network, Receipt, Settings, Sun, Users, Wrench, X,
} from 'lucide-react';
import { AmplifyLogo, AmplifyMark } from './Brand';
import { LangSwitch } from './LangSwitch';
import { t } from '../lib/i18n';
import { isSolo, type Office } from '../lib/types';

// 'tasks', 'team' and 'plan' are no longer separate tabs (tasks live in the Agenda, team and plan in Settings),
// but other screens may still send the user there: App opens the right place.
export type View = 'today' | 'agenda' | 'overview' | 'properties' | 'leads' | 'viewings' | 'deals' | 'invoices' | 'leases' | 'stays' | 'syndic' | 'projects' | 'maintenance'
  | 'network' | 'settings' | 'tasks' | 'team' | 'plan' | 'site' | 'billing' | 'vouchers' | 'website';

/** The overview with the numbers is for the owner and managers. */
export const canSeeOverview = (role: Office['role']) => role === 'owner' || role === 'manager';

type Item = { id: View; label: string; icon: ReactNode };
type Group = { title: string; items: Item[] };

/** Which tab a view belongs to (so "tasks" lights up the Agenda, "team" lights up Settings). */
const ownerOf = (v: View, solo = false): View => (v === 'tasks' ? 'agenda' : v === 'site' && solo ? 'site' : v === 'team' || v === 'plan' || v === 'site' || v === 'billing' ? 'settings' : v);

function groups(role: Office['role'], solo = false): Group[] {
  const i = (id: View, label: string, icon: ReactNode): Item => ({ id, label, icon });
  const ic = 'h-[18px] w-[18px] shrink-0';
  // Amplify Agent: only what one agent working alone needs
  if (solo) return [
    { title: t('Work'), items: [i('today', t('Today'), <Sun className={ic} />), i('agenda', t('Agenda'), <CalendarDays className={ic} />)] },
    { title: t('My business'), items: [
      i('properties', t('My properties'), <Building2 className={ic} />), i('leads', t('My clients'), <Users className={ic} />),
      i('vouchers', t('Visit vouchers'), <FileSignature className={ic} />), i('network', t('Colleagues'), <Network className={ic} />),
      i('website', t('My showcase'), <Globe className={ic} />),
    ] },
  ];
  return [
    { title: t('Work'), items: [i('today', t('Today'), <Sun className={ic} />), i('agenda', t('Agenda'), <CalendarDays className={ic} />)] },
    { title: t('Sales'), items: [
      i('properties', t('Properties'), <Building2 className={ic} />), i('leads', t('Leads'), <Users className={ic} />),
      i('viewings', t('Viewings'), <CalendarClock className={ic} />), i('deals', t('Deals'), <Handshake className={ic} />),
      i('network', t('Network'), <Network className={ic} />),
    ] },
    { title: 'Amplify Vitrine', items: [i('website', t('My website'), <Globe className={ic} />)] },
    { title: t('Rentals and management'), items: [i('leases', t('Rentals'), <KeyRound className={ic} />), i('stays', t('Short stays'), <BedDouble className={ic} />), i('maintenance', t('Maintenance'), <Wrench className={ic} />)] },
    { title: t('Syndic'), items: [i('syndic', t('Residences'), <Building className={ic} />)] },
    { title: t('New build'), items: [i('projects', t('Projects'), <HardHat className={ic} />)] },
    { title: t('Money'), items: [
      ...(role !== 'viewer' ? [i('invoices', t('Invoices'), <Receipt className={ic} />)] : []),
      ...(canSeeOverview(role) ? [i('overview', t('Overview'), <BarChart3 className={ic} />)] : []),
    ] },
  ].filter(g => g.items.length > 0);
}

/** On a phone the bar at the bottom holds the four screens used most; the rest is under "More". */
const BOTTOM: View[] = ['today', 'properties', 'leads', 'agenda'];
const BOTTOM_SOLO: View[] = ['properties', 'leads', 'vouchers', 'agenda'];

function OfficePick({ offices, office, onPick }: { offices: Office[]; office: Office; onPick: (id: string) => void }) {
  if (offices.length < 2) return <span className="block truncate text-sm font-semibold text-white/85">{office.name}</span>;
  return (
    <select value={office.id} onChange={e => onPick(e.target.value)} aria-label={t('Office')}
      className="w-full truncate rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white outline-none ring-1 ring-white/15">
      {offices.map(o => <option key={o.id} value={o.id} className="text-ink">{o.name}</option>)}
    </select>
  );
}

export function Shell({ offices, office, view, onView, onPick, onSignOut, banner, children }: {
  offices: Office[]; office: Office; view: View; onView: (v: View) => void; onPick: (id: string) => void; onSignOut: () => void; banner?: ReactNode; children: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const active = ownerOf(view, office.edition === 'agent');
  const solo = isSolo(office);
  const gs = groups(office.role, solo);
  const bottom = solo ? BOTTOM_SOLO : BOTTOM;
  const all = gs.flatMap(g => g.items);
  const settings: Item = { id: 'settings', label: t('Settings'), icon: <Settings className="h-[18px] w-[18px] shrink-0" /> };
  const go = (v: View) => { setMore(false); onView(v); window.scrollTo(0, 0); };

  useEffect(() => {
    if (!more) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [more]);

  const navButton = (x: Item) => (
    <button key={x.id} type="button" onClick={() => go(x.id)} aria-current={active === x.id ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-semibold transition ${active === x.id ? 'bg-white text-night' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
      {x.icon}<span className="truncate">{x.label}</span>
    </button>
  );

  return (
    <div className="flex min-h-full">
      {/* ---- Desktop: sidebar ---- */}
      <aside className="night sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex">
        <div className="space-y-3 px-4 pb-3 pt-5">
          <AmplifyLogo size="sm" />
          <OfficePick offices={offices} office={office} onPick={onPick} />
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2" aria-label={t('Sections')}>
          {gs.map(g => (
            <div key={g.title}>
              <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-white/45">{g.title}</p>
              <div className="space-y-0.5">{g.items.map(navButton)}</div>
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/10 px-3 py-3">
          {navButton(settings)}
          <div className="flex items-center justify-between gap-2 px-1">
            <LangSwitch />
            <button onClick={onSignOut} aria-label={t('Sign out')} title={t('Sign out')}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- Phone and tablet: slim header ---- */}
        <header className="night sticky top-0 z-30 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <AmplifyLogo size="sm" className="hidden min-w-0 sm:flex" />
            <AmplifyMark className="h-6 w-9 shrink-0 sm:hidden" />
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 max-w-[12rem]"><OfficePick offices={offices} office={office} onPick={onPick} /></div>
              <LangSwitch />
            </div>
          </div>
        </header>
        {banner}
        <main className="flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      {/* ---- Phone and tablet: bottom bar ---- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/10 bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={t('Sections')}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map(id => all.find(x => x.id === id)).filter((x): x is Item => !!x).map(x => (
            <button key={x.id} type="button" onClick={() => go(x.id)} aria-current={active === x.id ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${active === x.id ? 'text-brand' : 'text-muted hover:text-ink'}`}>
              {x.icon}<span className="max-w-full truncate px-1">{x.label}</span>
            </button>
          ))}
          <button type="button" onClick={() => setMore(true)} aria-expanded={more}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${!bottom.includes(active) ? 'text-brand' : 'text-muted hover:text-ink'}`}>
            <LayoutGrid className="h-[18px] w-[18px]" /><span>{t('More')}</span>
          </button>
        </div>
      </nav>

      {/* ---- "More": everything, grouped ---- */}
      {more && (
        <div className="fixed inset-0 z-40 flex items-end bg-night/50 lg:hidden" onMouseDown={e => { if (e.target === e.currentTarget) setMore(false); }}>
          <div className="pop max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" role="dialog" aria-label={t('More')}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-lg font-bold">{t('All sections')}</p>
              <button type="button" onClick={() => setMore(false)} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
            {[...gs, { title: t('Office'), items: [settings] }].map(g => (
              <div key={g.title} className="mb-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {g.items.map(x => (
                    <button key={x.id} type="button" onClick={() => go(x.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-semibold transition ${active === x.id ? 'bg-brand/10 text-brand' : 'bg-surface-2 text-ink hover:ring-2 hover:ring-brand/25'}`}>
                      {x.icon}<span className="max-w-full truncate">{x.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={onSignOut} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 text-sm font-semibold text-muted hover:text-ink">
              <LogOut className="h-4 w-4" /> {t('Sign out')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
