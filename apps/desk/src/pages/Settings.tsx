import { useState } from 'react';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { canSeeOverview } from '../components/Shell';
import { Team } from './Team';
import { Plan } from './Plan';
import { AgentProfile } from '../components/AgentProfile';
import { PublicProfile } from './PublicProfile';
import { WebsiteSettings } from '../components/WebsiteSettings';
import { FeedSettings } from '../components/FeedSettings';
import { BillingSettings } from '../components/BillingSettings';

export type SettingsTab = 'team' | 'site' | 'billing' | 'plan';

/** Everything about the office itself: the team, the public pages and website, invoice details and the plan. */
export function Settings({ office, userId, onSelfChanged, initialTab = 'team' }: { office: Office; userId: string; onSelfChanged: () => void; initialTab?: SettingsTab }) {
  const canManage = office.role === 'owner' || office.role === 'manager';
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'team', label: t('Team') },
    { id: 'site', label: t('Public pages and website') },
    ...(office.role !== 'viewer' ? [{ id: 'billing' as SettingsTab, label: t('Invoice details') }] : []),
    ...(canSeeOverview(office.role) ? [{ id: 'plan' as SettingsTab, label: t('Plan') }] : []),
  ];
  const [tab, setTab] = useState<SettingsTab>(tabs.some(x => x.id === initialTab) ? initialTab : 'team');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Settings')}</h1>
      <p className="text-sm text-muted">{office.name}</p>
      <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist">
        {tabs.map(x => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === x.id ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'team' && <Team office={office} userId={userId} onSelfChanged={onSelfChanged} embedded />}
        {tab === 'site' && (<>
          <PublicProfile office={office} canManage={canManage} onSlugChanged={onSelfChanged} />
          <AgentProfile office={office} canManage={canManage} />
          <WebsiteSettings office={office} canManage={canManage} />
          <FeedSettings office={office} canManage={canManage} />
        </>)}
        {tab === 'billing' && <BillingSettings office={office} canManage={canManage} />}
        {tab === 'plan' && <Plan office={office} embedded />}
      </div>
    </div>
  );
}
