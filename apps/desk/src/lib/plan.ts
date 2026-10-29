import { supabase } from './supabase';
import { t } from './i18n';
import { friendly } from './errors';

export type PlanInfo = {
  plan: 'trial' | 'active' | 'free';
  edition?: 'agence' | 'agent';
  plan_until: string;
  days_left: number;
  is_open: boolean;
  max_members: number;
  max_properties: number;
  members: number;
  properties: number;
};

/** The plan of an office. Returns null when the database function is not installed yet (the app then works as before). */
export async function loadPlan(orgId: string): Promise<PlanInfo | null> {
  try {
    const { data, error } = await supabase.rpc('org_plan', { p_org: orgId });
    if (error || !data) return null;
    return data as PlanInfo;
  } catch { return null; }
}

/** The database answers with short codes; the plan ones become a sentence. Other messages stay as they are. */
export function planError(message: string): string {
  if (message.includes('plan_expired')) return t('Your plan has ended. You can still look at everything, but not change anything.');
  if (message.includes('plan_limit_properties')) return t('You have reached the maximum number of properties of your plan.');
  if (message.includes('plan_limit_members')) return t('You have reached the maximum number of team members of your plan.');
  return friendly(message);
}
