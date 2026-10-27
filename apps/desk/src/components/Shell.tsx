import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { AmplifyLogo } from './Brand';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';

export function Shell({ offices, office, onPick, onSignOut, children }: {
  offices: Office[]; office: Office; onPick: (id: string) => void; onSignOut: () => void; children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="night sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
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
          <button onClick={onSignOut} aria-label={t('Sign out')} title={t('Sign out')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
