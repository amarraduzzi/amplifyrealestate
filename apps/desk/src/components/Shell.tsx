import type { ReactNode } from 'react';
import { BarChart3, Building2, CalendarClock, ListChecks, LogOut, Sun, UserCog, Users } from 'lucide-react';
import { AmplifyLogo } from './Brand';
import { LangSwitch } from './LangSwitch';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';

export type View = 'today' | 'overview' | 'properties' | 'leads' | 'viewings' | 'tasks' | 'team';

/** The overview with the numbers is for the owner and managers. */
export const canSeeOverview = (role: Office['role']) => role === 'owner' || role === 'manager';

export function Shell({ offices, office, view, onView, onPick, onSignOut, children }: {
  offices: Office[]; office: Office; view: View; onView: (v: View) => void; onPick: (id: string) => void; onSignOut: () => void; children: ReactNode;
}) {
  const tabs: { id: View; label: string; icon: ReactNode }[] = [
    { id: 'today', label: t('Today'), icon: <Sun className="h-4 w-4" /> },
    ...(canSeeOverview(office.role) ? [{ id: 'overview' as View, label: t('Overview'), icon: <BarChart3 className="h-4 w-4" /> }] : []),
    { id: 'properties', label: t('Properties'), icon: <Building2 className="h-4 w-4" /> },
    { id: 'leads', label: t('Leads'), icon: <Users className="h-4 w-4" /> },
    { id: 'viewings', label: t('Viewings'), icon: <CalendarClock className="h-4 w-4" /> },
    { id: 'tasks', label: t('Tasks'), icon: <ListChecks className="h-4 w-4" /> },
    { id: 'team', label: t('Team'), icon: <UserCog className="h-4 w-4" /> },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <header className="night sticky top-0 z-30 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center justify-between gap-3 pb-2">
          <AmplifyLogo size="sm" className="min-w-0" />
          <div className="flex min-w-0 items-center gap-3">
            {offices.length > 1
              ? (
                <select value={office.id} onChange={e => onPick(e.target.value)} aria-label={t('Office')}
                  className="max-w-[10rem] truncate rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white outline-none ring-1 ring-white/15">
                  {offices.map(o => <option key={o.id} value={o.id} className="text-ink">{o.name}</option>)}
                </select>
              )
              : <span className="hidden max-w-[12rem] truncate text-sm font-semibold text-white/80 sm:block">{office.name}</span>}
            <LangSwitch />
            <button onClick={onSignOut} aria-label={t('Sign out')} title={t('Sign out')}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={t('Sections')}>
          {tabs.map(x => (
            <button key={x.id} onClick={() => onView(x.id)} aria-current={view === x.id ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${view === x.id ? 'bg-white text-night' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              {x.icon}{x.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
