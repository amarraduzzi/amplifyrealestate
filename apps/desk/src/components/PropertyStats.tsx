import { useEffect, useState } from 'react';
import { Eye, FileText, MessageCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';

type Day = { day: string; views: number; whatsapp: number; calls: number; forms: number };
type Totals = { views: number; whatsapp: number; calls: number; forms: number };
const ZERO: Totals = { views: 0, whatsapp: 0, calls: 0, forms: 0 };

/** Date as YYYY-MM-DD, n days back from today (local time). */
function daysBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sum(rows: Day[], from?: string): Totals {
  const r = { ...ZERO };
  for (const x of rows) {
    if (from && x.day < from) continue;
    r.views += x.views; r.whatsapp += x.whatsapp; r.calls += x.calls; r.forms += x.forms;
  }
  return r;
}

/**
 * How often the public page of one property was seen and how often a visitor reached out.
 * The numbers come from page_stats, which the public pages fill in already (views, WhatsApp, calls, forms).
 */
export function PropertyStats({ property }: { office: Office; property: PropertyRow }) {
  const [rows, setRows] = useState<Day[] | null | 'error'>(null);

  useEffect(() => {
    let live = true;
    supabase.from('page_stats').select('day, views, whatsapp, calls, forms').eq('property_id', property.id)
      .then(({ data, error }) => { if (live) setRows(error ? 'error' : (data ?? []) as Day[]); });
    return () => { live = false; };
  }, [property.id]);

  if (rows === 'error') return null; // older database without page_stats: show nothing
  const list = rows ?? [];
  const periods: { label: string; v: Totals }[] = [
    { label: t('Last 7 days'), v: sum(list, daysBack(6)) },
    { label: t('Last 30 days'), v: sum(list, daysBack(29)) },
    { label: t('Total'), v: sum(list) },
  ];
  const cols = [
    { key: 'views' as const, label: t('Views'), Icon: Eye },
    { key: 'whatsapp' as const, label: t('WhatsApp clicks'), Icon: MessageCircle },
    { key: 'calls' as const, label: t('Calls'), Icon: Phone },
    { key: 'forms' as const, label: t('Forms'), Icon: FileText },
  ];
  const empty = rows !== null && sum(list).views + sum(list).whatsapp + sum(list).calls + sum(list).forms === 0;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t('Interest in this property')}</h3>
      {rows === null && <p className="text-sm text-muted">…</p>}
      {empty && <p className="text-sm text-muted">{t('No visits yet. Put the page online and share the link: the numbers appear here.')}</p>}
      {rows !== null && !empty && (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-line/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-xs text-muted">
                <th className="px-3 py-2 text-start font-semibold" />
                {cols.map(c => (
                  <th key={c.key} className="px-3 py-2 text-end font-semibold">
                    <span className="inline-flex items-center gap-1"><c.Icon className="h-3.5 w-3.5" aria-hidden />{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.label} className="border-t border-line/[0.07]">
                  <td className="px-3 py-2 font-semibold">{p.label}</td>
                  {cols.map(c => <td key={c.key} className="px-3 py-2 text-end tabular-nums">{p.v[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
