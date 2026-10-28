import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { STATUSES, VIEWING_OUTCOMES, LEAD_STATUSES, leadStatusCls, leadStatusLabel, outcomeCls, outcomeLabel, statusCls, statusLabel } from '../lib/labels';
import { computeOverview, type MandateAlert, type OverviewInput } from '../lib/overview';
import { Card } from '../components/ui';
import type { View } from '../components/Shell';
import { friendly } from '../lib/errors';

const PAGE = 1000;
const SHOWN = 8;

/** Reads every row (the database returns at most 1000 per request). */
async function fetchAll<T>(table: string, columns: string, orgId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).eq('org_id', orgId).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

function Stat({ label, value, hint, tone = 'plain' }: { label: string; value: number; hint?: string; tone?: 'plain' | 'warn' | 'ok' }) {
  const cls = tone === 'warn' && value > 0 ? 'text-warn' : tone === 'ok' ? 'text-ok' : '';
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className={`tabular font-display text-2xl font-bold ${cls}`}>{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Chip({ cls, label, n }: { cls: string; label: string; n: number }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${cls} ${n === 0 ? 'opacity-50' : ''}`}>
      {label}<span className="tabular">{n}</span>
    </span>
  );
}

function Section({ title, to, onGo, children }: { title: string; to: View; onGo: (v: View) => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button type="button" onClick={() => onGo(to)} className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <Card>{children}</Card>
    </section>
  );
}

function AlertList({ title, items, text, cls }: { title: string; items: MandateAlert[]; text: (a: MandateAlert) => string; cls: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold">{title} <span className="tabular opacity-60">{items.length}</span></h3>
      <ul className="space-y-1.5">
        {items.slice(0, SHOWN).map(x => (
          <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
            <p className="min-w-0 truncate text-sm font-semibold">{x.title} <span className="tabular font-normal text-muted">· {x.reference}</span></p>
            <span className={`shrink-0 text-xs font-semibold ${cls}`}>{text(x)}</span>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && <p className="mt-1.5 text-xs text-muted">{t('And {n} more.', { n: items.length - SHOWN })}</p>}
    </div>
  );
}

const endsText = (a: MandateAlert) =>
  a.days <= 0 ? t('Ends today') : a.days === 1 ? t('Ends tomorrow') : t('Ends in {n} days', { n: a.days });
const expiredText = (a: MandateAlert) =>
  a.days <= 0 ? '' : a.days === 1 ? t('Expired yesterday') : t('Expired {n} days ago', { n: a.days });

/** Numbers for the owner and managers: properties per status, new leads, viewings and mandates that need attention. */
export function Overview({ office, onGo }: { office: Office; onGo: (v: View) => void }) {
  const [data, setData] = useState<OverviewInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [properties, mandates, leads, viewings, payments, repairs] = await Promise.all([
        fetchAll<OverviewInput['properties'][number]>('properties', 'id, title, reference, status, is_published', office.id),
        fetchAll<OverviewInput['mandates'][number]>('property_mandates', 'id, property_id, status, valid_until', office.id),
        fetchAll<OverviewInput['leads'][number]>('leads', 'id, status, created_at', office.id),
        fetchAll<OverviewInput['viewings'][number]>('viewings', 'id, status, outcome, scheduled_at', office.id),
        // Not installed yet (etappe 3b and 3c): the overview then simply shows zeros.
        fetchAll<NonNullable<OverviewInput['payments']>[number]>('rent_payments', 'id, status, due_date, amount_cents', office.id).catch(() => []),
        fetchAll<NonNullable<OverviewInput['repairs']>[number]>('maintenance_requests', 'id, status, priority', office.id).catch(() => []),
      ]);
      setData({ properties, mandates, leads, viewings, payments, repairs });
      setError(null);
    } catch (e) { setError(friendly(e)); }
  }, [office.id]);
  useEffect(() => { load(); }, [load]);

  const o = useMemo(() => (data ? computeOverview(data) : null), [data]);
  const m = o?.mandates;
  const allGood = !!m && m.expired.length === 0 && m.missing.length === 0 && m.expiring.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Overview')}</h1>
      <p className="text-sm text-muted">{t('Figures for your office: properties, leads, viewings and mandates.')}</p>

      {error && (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error} <button type="button" onClick={load} className="underline">{t('Try again')}</button>
        </p>
      )}
      {!o && !error && <p className="mt-10 text-center text-muted">…</p>}

      {o && m && (
        <div className="mt-6 space-y-8">
          <Section title={t('Properties')} to="properties" onGo={onGo}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label={t('Properties')} value={o.properties.total} />
              <Stat label={t('Online now')} value={o.properties.online} tone="ok" hint={t('Available or reserved, page switched on, valid mandate.')} />
            </div>
            <p className="mb-2 mt-4 text-sm font-semibold">{t('By status')}</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => <Chip key={s} cls={statusCls[s]} label={statusLabel(s)} n={o.properties.byStatus[s]} />)}
            </div>
          </Section>

          <Section title={t('Leads')} to="leads" onGo={onGo}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label={t('Still looking')} value={o.leads.open} hint={t('New, active or viewing.')} />
              <Stat label={t('New this week')} value={o.leads.newWeek} tone="ok" />
              <Stat label={t('New this month')} value={o.leads.newMonth} />
            </div>
            <p className="mb-2 mt-4 text-sm font-semibold">{t('By status')}</p>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map(s => <Chip key={s} cls={leadStatusCls[s]} label={leadStatusLabel(s)} n={o.leads.byStatus[s]} />)}
            </div>
          </Section>

          <Section title={t('Viewings')} to="viewings" onGo={onGo}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label={t('Next 7 days')} value={o.viewings.upcoming} />
              <Stat label={t('Done, last 30 days')} value={o.viewings.done30} tone="ok" />
              <Stat label={t('No-shows, last 30 days')} value={o.viewings.noShow30} tone="warn" />
              <Stat label={t('Not closed yet')} value={o.viewings.pastOpen} tone="warn" hint={t('In the past, still marked as scheduled.')} />
            </div>
            <p className="mb-2 mt-4 text-sm font-semibold">{t('Results of the viewings done in the last 30 days')}</p>
            <div className="flex flex-wrap gap-2">
              {VIEWING_OUTCOMES.map(x => <Chip key={x} cls={outcomeCls[x]} label={outcomeLabel(x)} n={o.viewings.outcomes[x]} />)}
            </div>
          </Section>

          <Section title={t('Rent and repairs')} to="leases" onGo={onGo}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label={t('Unpaid months')} value={o.rent.overdueCount} tone="warn" hint={o.rent.overdueCount > 0 ? t('{amount} in total', { amount: formatMad(o.rent.overdueCents) }) : t('Nothing overdue')} />
              <Stat label={t('Open repairs')} value={o.repairs.open} hint={t('Open or in progress')} />
              <Stat label={t('Urgent')} value={o.repairs.urgent} tone="warn" hint={t('Open and marked urgent')} />
            </div>
            <button type="button" onClick={() => onGo('maintenance')} className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
              {t('Maintenance')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </Section>

          <Section title={t('Mandates')} to="properties" onGo={onGo}>
            <p className="mb-3 text-sm text-muted">{t('Only properties that are available or reserved are counted. Without a valid mandate a property cannot be online.')}</p>
            {allGood
              ? <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{t('All mandates are in order.')}</p>
              : (
                <div className="space-y-5">
                  <AlertList title={t('Expired mandates')} items={m.expired} text={expiredText} cls="text-danger" />
                  <AlertList title={t('No mandate on file')} items={m.missing} text={() => ''} cls="text-danger" />
                  <AlertList title={t('Ending within 30 days')} items={m.expiring} text={endsText} cls="text-warn" />
                </div>
              )}
          </Section>
        </div>
      )}
    </div>
  );
}
