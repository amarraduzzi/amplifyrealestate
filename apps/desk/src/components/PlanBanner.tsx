import { Clock, Lock } from 'lucide-react';
import { t } from '../lib/i18n';
import type { PlanInfo } from '../lib/plan';
import type { View } from './Shell';

/** A thin strip under the header: trial days left, a plan that ends soon, or a plan that has ended (read only). */
export function PlanBanner({ plan, canSee, onGo }: { plan: PlanInfo | null; canSee: boolean; onGo: (v: View) => void }) {
  if (!plan) return null;
  if (plan.plan === 'free') {
    if (plan.properties < plan.max_properties) return null;
    return (
      <div className="bg-brand/10 px-4 py-2 text-sm font-semibold text-brand sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <span className="min-w-0 flex-1">{t('Amplify Agent free: {used} of {max} properties. Upgrade for unlimited properties.', { used: plan.properties, max: plan.max_properties })}</span>
          {canSee && <button type="button" onClick={() => onGo('plan')} className="shrink-0 underline underline-offset-2">{t('See plan')}</button>}
        </div>
      </div>
    );
  }
  const ended = !plan.is_open;
  const soon = plan.is_open && (plan.plan === 'trial' || plan.days_left <= 7);
  if (!ended && !soon) return null;

  const text = ended
    ? t('Your plan has ended. You can still look at everything, but not change anything.')
    : plan.plan === 'trial'
      ? (plan.days_left === 0 ? t('Free trial: last day today.') : t('Free trial: {n} days left.', { n: plan.days_left }))
      : (plan.days_left === 0 ? t('Your plan ends today.') : t('Your plan ends in {n} days.', { n: plan.days_left }));

  return (
    <div className={`px-4 py-2 text-sm font-semibold sm:px-6 ${ended ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'}`}>
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        {ended ? <Lock className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">{text}</span>
        {canSee && <button type="button" onClick={() => onGo('plan')} className="shrink-0 underline underline-offset-2">{t('See plan')}</button>}
      </div>
    </div>
  );
}
