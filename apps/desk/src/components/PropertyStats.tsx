import { useEffect, useState } from 'react';
import { Eye, FileText, MessageCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { Btn } from './ui';
import { waLink } from './ContactLinks';
import { PUBLIC_SITE, propertyUrl, whatsappShareUrl } from '../lib/publicSite';

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

/** Active owner of the property (name and WhatsApp or phone number), from the active mandate. Null when there is none. */
async function loadOwner(propertyId: string): Promise<{ name: string; number: string | null } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const m = await supabase.from('property_mandates').select('owner_person_id, status, valid_until').eq('property_id', propertyId);
  if (m.error) return null;
  const active = ((m.data ?? []) as { owner_person_id: string | null; status: string; valid_until: string | null }[])
    .filter(x => x.status === 'active' && x.owner_person_id && (!x.valid_until || x.valid_until >= today))
    .sort((a, b) => (b.valid_until ?? '9999').localeCompare(a.valid_until ?? '9999'))[0];
  if (!active?.owner_person_id) return null;
  const p = await supabase.from('people').select('full_name, phone, whatsapp').eq('id', active.owner_person_id).maybeSingle();
  const r = p.data as { full_name: string; phone: string | null; whatsapp: string | null } | null;
  return r ? { name: r.full_name, number: r.whatsapp || r.phone } : null;
}

/** "12 (3 more than last week)", "5 (same as last week)" ... */
function withDelta(now: number, before: number): string {
  if (now === before) return t('{n} (same as last week)', { n: now });
  return now > before
    ? t('{n} ({d} more than last week)', { n: now, d: now - before })
    : t('{n} ({d} fewer than last week)', { n: now, d: before - now });
}

/**
 * How often the public page of one property was seen and how often a visitor reached out.
 * The numbers come from page_stats, which the public pages fill in already (views, WhatsApp, calls, forms).
 */
export function PropertyStats({ office, property }: { office: Office; property: PropertyRow }) {
  const [rows, setRows] = useState<Day[] | null | 'error'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.from('page_stats').select('day, views, whatsapp, calls, forms').eq('property_id', property.id)
      .then(({ data, error }) => { if (live) setRows(error ? 'error' : (data ?? []) as Day[]); });
    return () => { live = false; };
  }, [property.id]);

  /** One WhatsApp message to the owner: this week against last week, plus the viewings held. Sent by hand, one tap. */
  const sendWeekly = async () => {
    if (rows === 'error' || rows === null) return;
    setBusy(true);
    try {
      const thisWeek = sum(rows, daysBack(6));
      const lastWeek = sum(rows.filter(x => x.day < daysBack(6)), daysBack(13));
      const since = new Date(); since.setDate(since.getDate() - 7);
      const [owner, v] = await Promise.all([
        loadOwner(property.id),
        supabase.from('viewings').select('id', { count: 'exact', head: true }).eq('property_id', property.id).eq('status', 'done').gte('scheduled_at', since.toISOString()),
      ]);
      const held = v.error ? 0 : v.count ?? 0;
      const lines = [
        t(owner ? 'Hello {name}, here is the weekly update on {title} ({reference}).' : 'Hello, here is the weekly update on {title} ({reference}).', { name: owner?.name ?? '', title: property.title, reference: property.reference }),
        t('Page visits this week: {x}', { x: withDelta(thisWeek.views, lastWeek.views) }),
        t('Contact requests this week: {x}', { x: withDelta(thisWeek.whatsapp + thisWeek.calls + thisWeek.forms, lastWeek.whatsapp + lastWeek.calls + lastWeek.forms) }),
        t('Viewings held this week: {n}', { n: held }),
      ];
      if (property.is_published && PUBLIC_SITE) lines.push(propertyUrl(office.slug, property.reference, getLang()));
      lines.push(`— ${office.name}`);
      const text = lines.join('\n');
      const n = owner?.number;
      window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : whatsappShareUrl(text), '_blank', 'noopener');
    } finally { setBusy(false); }
  };

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
      {rows !== null && (
        <div className="mt-3">
          <Btn onClick={sendWeekly} disabled={busy}><MessageCircle className="h-4 w-4" /> {t('Send weekly update to the owner')}</Btn>
          <p className="mt-1 text-xs text-muted">{t('Opens WhatsApp with this week’s numbers, ready to send to the owner. Every Monday is a good moment.')}</p>
        </div>
      )}
    </div>
  );
}
