import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { lastMonth, monthName, type OwnerLang } from '../lib/management';
import type { View } from './Shell';

type Row = { key: string; title: string; owner: string; text: string; amount: number | null };

/** On Today: managed properties without last month's statement, and statements still to pay out to the owner. */
export function PayoutsDue({ office, onGo, onCount }: { office: Office; onGo: (v: View) => void; onCount: (n: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const lang: OwnerLang = getLang() === 'ar' ? 'ar' : getLang() === 'en' ? 'en' : 'fr';

  const load = useCallback(async () => {
    if (office.role === 'viewer') { setRows([]); onCount(0); return; }
    const [c, s] = await Promise.all([
      supabase.from('management_contracts').select('id, property_id, owner_person_id, payout_day').eq('org_id', office.id).eq('status', 'active'),
      supabase.from('owner_statements').select('id, contract_id, property_id, owner_person_id, period, payout_cents, status').eq('org_id', office.id).gte('period', lastMonth()),
    ]);
    if (c.error || s.error) { setRows([]); onCount(0); return; }
    const contracts = (c.data ?? []) as { id: string; property_id: string; owner_person_id: string; payout_day: number }[];
    const sts = (s.data ?? []) as { id: string; contract_id: string; property_id: string; owner_person_id: string; period: string; payout_cents: number; status: string }[];
    const prev = lastMonth();
    const missing = contracts.filter(x => !sts.some(y => y.contract_id === x.id && y.period === prev));
    const open = sts.filter(x => x.status === 'open');
    const propIds = Array.from(new Set([...missing.map(x => x.property_id), ...open.map(x => x.property_id)]));
    const peopleIds = Array.from(new Set([...missing.map(x => x.owner_person_id), ...open.map(x => x.owner_person_id)]));
    if (!propIds.length) { setRows([]); onCount(0); return; }
    const [pr, pe] = await Promise.all([
      supabase.from('properties').select('id, title').in('id', propIds),
      supabase.from('people').select('id, full_name').in('id', peopleIds),
    ]);
    const title = new Map(((pr.data ?? []) as { id: string; title: string }[]).map(x => [x.id, x.title]));
    const name = new Map(((pe.data ?? []) as { id: string; full_name: string }[]).map(x => [x.id, x.full_name]));
    const list: Row[] = [
      ...open.map(x => ({ key: x.id, title: title.get(x.property_id) ?? '…', owner: name.get(x.owner_person_id) ?? '…', text: t('Pay out {month}', { month: monthName(x.period, lang) }), amount: x.payout_cents })),
      ...missing.map(x => ({ key: x.id, title: title.get(x.property_id) ?? '…', owner: name.get(x.owner_person_id) ?? '…', text: t('Make the statement of {month}', { month: monthName(prev, lang) }), amount: null })),
    ];
    setRows(list); onCount(list.length);
  }, [office.id, office.role, onCount, lang]);
  useEffect(() => { load(); }, [load]);
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t('Owner payouts')} <span className="tabular text-base opacity-60">{rows.length}</span></h2>
        <button type="button" onClick={() => onGo('properties')} className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <ul className="space-y-2">
        {rows.slice(0, 6).map(r => (
          <li key={r.key} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
            <p className="min-w-0 truncate text-sm font-semibold">{r.title} <span className="font-normal text-muted">· {r.owner}</span></p>
            <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-warn">
              {r.amount !== null && <span className="tabular">{formatMad(r.amount)}</span>}
              <span>{r.text}</span>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: rows.length - 6 })}</p>}
    </section>
  );
}
