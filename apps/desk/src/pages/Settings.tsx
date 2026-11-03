import { useState } from 'react';
import { t } from '../lib/i18n';
import { readTheme, saveTheme, type Theme } from '../lib/theme';
import { Hero, PhoneSheet } from '../components/Hero';
import { isSolo, type Office } from '../lib/types';
import { canSeeOverview } from '../components/Shell';
import { Team } from './Team';
import { Plan } from './Plan';
import { AgentProfile } from '../components/AgentProfile';
import { PublicProfile } from './PublicProfile';
import { WebsiteSettings } from '../components/WebsiteSettings';
import { FeedSettings } from '../components/FeedSettings';
import { BillingSettings } from '../components/BillingSettings';
import { LangSwitch } from '../components/LangSwitch';

export type SettingsTab = 'team' | 'site' | 'billing' | 'plan';

/** Everything about the office itself: the team, the public pages and website, invoice details and the plan. */
export function Settings({ office, userId, onSelfChanged, initialTab = 'team' }: { office: Office; userId: string; onSelfChanged: () => void; initialTab?: SettingsTab }) {
  const canManage = office.role === 'owner' || office.role === 'manager';
  const solo = isSolo(office);
  const tabs: { id: SettingsTab; label: string }[] = solo ? [
    { id: 'site', label: t('My showcase') },
    ...(canSeeOverview(office.role) ? [{ id: 'plan' as SettingsTab, label: t('Plan') }] : []),
  ] : [
    { id: 'team', label: t('Team') },
    { id: 'site', label: t('Public pages and website') },
    ...(office.role !== 'viewer' ? [{ id: 'billing' as SettingsTab, label: t('Invoice details') }] : []),
    ...(canSeeOverview(office.role) ? [{ id: 'plan' as SettingsTab, label: t('Plan') }] : []),
  ];
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [tab, setTab] = useState<SettingsTab>(tabs.some(x => x.id === initialTab) ? initialTab : tabs[0].id);

  return (
    <>
    <Hero
      title={t('Settings')}
      sub={office.name}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <h1 className="font-display text-2xl font-bold max-lg:hidden sm:text-3xl">{t('Settings')}</h1>
      <p className="text-sm text-muted max-lg:hidden">{office.name}</p>
      <div className="card lift mt-4 divide-y divide-line/[0.07] rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold">{t('Language')}</span>
          <div className="rounded-full bg-surface-2 p-0.5"><LangSwitch light /></div>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold">{t('Appearance')}</span>
          <div className="flex rounded-full bg-surface-2 p-0.5" role="group" aria-label={t('Appearance')}>
            {([['light', t('Light')], ['dark', t('Dark')], ['auto', t('Automatic')]] as [Theme, string][]).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={theme === k} onClick={() => { setTheme(k); saveTheme(k); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${theme === k ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>
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
          {!solo && <FeedSettings office={office} canManage={canManage} />}
        </>)}
        {tab === 'billing' && <BillingSettings office={office} canManage={canManage} />}
        {tab === 'plan' && <Plan office={office} embedded onEditionChanged={onSelfChanged} />}
      </div>
    </div>
    </PhoneSheet>
    </>
  );
}
