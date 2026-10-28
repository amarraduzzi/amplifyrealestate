import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { adQuality, missing } from '../lib/adQuality';
import type { View } from './Shell';

type Weak = { id: string; title: string; reference: string; score: number; tip: string };

/** On Today: available properties whose ad is still weak, with the first thing to fix. */
export function WeakAds({ office, onGo }: { office: Office; onGo: (v: View) => void }) {
  const [rows, setRows] = useState<Weak[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const pr = await supabase.from('properties').select('*').eq('org_id', office.id).eq('status', 'available').limit(200);
      if (pr.error || !pr.data?.length) { if (live) setRows([]); return; }
      const props = pr.data as PropertyRow[];
      const ph = await supabase.from('property_photos').select('property_id').in('property_id', props.map(p => p.id));
      const n = new Map<string, number>();
      for (const x of (ph.data ?? []) as { property_id: string }[]) n.set(x.property_id, (n.get(x.property_id) ?? 0) + 1);
      const weak = props.map(p => { const q = adQuality(p, n.get(p.id) ?? 0, null); return { p, q }; })
        .filter(x => x.q.score < 60).sort((a, b) => a.q.score - b.q.score)
        .map(x => ({ id: x.p.id, title: x.p.title, reference: x.p.reference, score: x.q.score, tip: missing(x.q)[0]?.tip ?? '' }));
      if (live) setRows(weak);
    })();
    return () => { live = false; };
  }, [office.id]);
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t('Ads to improve')} <span className="tabular text-base opacity-60">{rows.length}</span></h2>
        <button type="button" onClick={() => onGo('properties')} className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <p className="mb-2 text-xs text-muted">{t('A complete ad gets more calls. Open the property to see what to fix.')}</p>
      <ul className="space-y-2">
        {rows.slice(0, 5).map(r => (
          <li key={r.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
            <p className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="min-w-0 truncate">{r.reference} · {r.title}</span><span className="tabular shrink-0 text-danger">{r.score}/100</span></p>
            <p className="mt-0.5 text-xs text-muted">{r.tip}</p>
          </li>
        ))}
      </ul>
      {rows.length > 5 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: rows.length - 5 })}</p>}
    </section>
  );
}
