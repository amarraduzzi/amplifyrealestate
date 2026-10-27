import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { Card } from './ui';
import type { View } from './Shell';

type Step = { id: string; label: string; hint: string; done: boolean; to: View };

const key = (orgId: string) => `desk-start-hidden-${orgId}`;
const hidden = (orgId: string) => { try { return localStorage.getItem(key(orgId)) === '1'; } catch { return false; } };

const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n ?? 0;
};

/** First steps for a new office, on the Today screen. Disappears by itself when everything is done, or when it is dismissed. */
export function GettingStarted({ office, onGo }: { office: Office; onGo: (v: View) => void }) {
  const manager = office.role === 'owner' || office.role === 'manager';
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [gone, setGone] = useState(() => hidden(office.id));

  useEffect(() => {
    if (gone || office.role === 'viewer') return;
    let live = true;
    (async () => {
      try {
        const [org, props, online, leads, members] = await Promise.all([
          supabase.from('organizations').select('public_whatsapp, public_phone, public_email').eq('id', office.id).maybeSingle(),
          count(supabase.from('properties').select('id', { count: 'exact', head: true }).eq('org_id', office.id)),
          count(supabase.from('properties').select('id', { count: 'exact', head: true }).eq('org_id', office.id).eq('is_published', true)),
          count(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', office.id)),
          count(supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', office.id)),
        ]);
        if (org.error) throw new Error(org.error.message);
        const d = org.data;
        const list: Step[] = [
          { id: 'contact', label: t('Add the contact details for your public pages'), hint: t('Your WhatsApp number, phone or e-mail, shown on every public page. You find it under Team.'), done: !!(d?.public_whatsapp || d?.public_phone || d?.public_email), to: 'team' },
          { id: 'property', label: t('Add your first property'), hint: t('Every price and status change from then on is recorded.'), done: props > 0, to: 'properties' },
          { id: 'online', label: t('Put a property online'), hint: t('Add a mandate, then switch on the public page of the property and share the link.'), done: online > 0, to: 'properties' },
          { id: 'lead', label: t('Add your first lead'), hint: t('Add one by hand, or import your contacts from a CSV file or from Excel.'), done: leads > 0, to: 'leads' },
        ];
        if (manager) list.push({ id: 'team', label: t('Invite a colleague'), hint: t('Add team members and give each a role.'), done: members > 1, to: 'team' });
        if (live) setSteps(list);
      } catch { /* the card is only a help: when it cannot load, show nothing */ }
    })();
    return () => { live = false; };
  }, [office.id, office.role, manager, gone]);

  if (gone || !steps || steps.every(s => s.done)) return null;
  const done = steps.filter(s => s.done).length;
  const dismiss = () => { try { localStorage.setItem(key(office.id), '1'); } catch { /* private mode: hidden for this visit only */ } setGone(true); };

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">{t('First steps')}</h2>
          <p className="text-sm text-muted">{t('{done} of {total} done', { done, total: steps.length })}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('Hide')} title={t('Hide')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {steps.map(s => (
          <li key={s.id}>
            <button type="button" onClick={() => onGo(s.to)} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-start transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${s.done ? 'bg-ok text-white' : 'border border-line/20 text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${s.done ? 'text-muted line-through' : ''}`}>{s.label}</span>
                {!s.done && <span className="block text-xs text-muted">{s.hint}</span>}
              </span>
              {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" />}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
