import { useEffect, useState } from 'react';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadPlan, planError, type PlanInfo } from '../lib/plan';
import { supabase } from '../lib/supabase';
import { Btn, Card } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular text-muted">{used} / {max}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${used >= max ? 'bg-danger' : 'gold-fill'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The plan of the office: trial or paid, last day, and use against the limits. For the owner and managers. */
export function Plan({ office, embedded = false, onEditionChanged }: { office: Office; embedded?: boolean; onEditionChanged?: () => void }) {
  const [plan, setPlan] = useState<PlanInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let live = true; loadPlan(office.id).then(p => { if (live) setPlan(p); }); return () => { live = false; }; }, [office.id]);
  const switchTo = async (edition: 'agence' | 'agent') => {
    const q = edition === 'agent'
      ? t('Switch to Amplify Agent? You work alone: free with 3 properties, with a simpler menu. You can switch back.')
      : t('Switch to Amplify Agence? You get the full menu and a free trial for your team.');
    if (!window.confirm(q)) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('set_edition', { p_org: office.id, p_edition: edition });
    setBusy(false);
    if (error) {
      setErr(error.message.includes('agent_heeft_team') ? t('Amplify Agent is for one person. Remove the other team members first.')
        : error.message.includes('uitvoering_betaald_plan') ? t('You have a paid plan. Contact Amplify to change it.') : planError(error.message));
      return;
    }
    onEditionChanged?.();
    setPlan(await loadPlan(office.id));
  };
  const solo = plan?.edition === 'agent';

  const date = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'long' }).format(new Date(iso + 'T12:00:00'));

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8'}>
      {!embedded && <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Plan')}</h1>}
      {!embedded && <p className="text-sm text-muted">{office.name}</p>}

      {plan === undefined && <p className="mt-10 text-center text-muted">…</p>}
      {plan === null && <Card className="mt-6"><p className="text-sm text-muted">{t('The plan could not be loaded.')}</p></Card>}
      {plan && (
        <div className="mt-6 space-y-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{solo ? 'Amplify Agent' : 'Amplify Agence'} · {plan.plan === 'trial' ? t('Free trial') : plan.plan === 'free' ? t('Free') : t('Paid plan')}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${plan.is_open ? '' : 'text-danger'}`}>
              {plan.is_open ? t('Active') : t('Ended')}
            </p>
            {plan.plan === 'free' ? <p className="mt-1 text-sm text-muted">{t('Free, without end date. Up to {n} properties.', { n: plan.max_properties })}</p> : <p className="mt-1 text-sm text-muted">
              {plan.is_open
                ? (plan.days_left === 0 ? t('Last day: {date}.', { date: date(plan.plan_until) }) : t('{n} days left, until {date}.', { n: plan.days_left, date: date(plan.plan_until) }))
                : t('Ended on {date}.', { date: date(plan.plan_until) })}
            </p>}
            {!plan.is_open && <p className="mt-3 text-sm">{t('You can still look at everything. Your public pages stay online. Changing things works again as soon as the plan is renewed.')}</p>}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-display text-lg font-semibold">{t('Use')}</h2>
            <Usage label={t('Team members')} used={plan.members} max={plan.max_members} />
            <Usage label={t('Properties (without withdrawn)')} used={plan.properties} max={plan.max_properties} />
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold">{t('Renew or upgrade')}</h2>
            <p className="mt-1 text-sm text-muted">{solo
              ? t('Amplify Agent: 99 DH per month or 990 DH per year, with unlimited properties. Contact Amplify to upgrade. Your data is never removed.')
              : t('Contact Amplify to renew your plan or to raise the limits. Your data is never removed.')}</p>
          </Card>

          {office.role === 'owner' && plan.plan !== 'active' && (
            <Card>
              <h2 className="font-display text-lg font-semibold">{solo ? t('Do you work with a team?') : t('Do you work alone?')}</h2>
              <p className="mt-1 text-sm text-muted">{solo
                ? t('Amplify Agence has the full menu: rentals, management, invoices, owners and your team.')
                : t('Amplify Agent is made for an agent who works alone: your showcase, visit vouchers and colleagues. Free up to 3 properties.')}</p>
              {err && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{err}</p>}
              <Btn className="mt-3" tone="ghost" disabled={busy} onClick={() => switchTo(solo ? 'agence' : 'agent')}>{busy ? '…' : solo ? t('Switch to Amplify Agence') : t('Switch to Amplify Agent')}</Btn>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
