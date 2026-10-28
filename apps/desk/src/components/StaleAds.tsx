import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadStaleAds, setRemoved, siteName, type PostingRow, type Site } from '../lib/postings';
import { planError } from '../lib/plan';
import type { View } from './Shell';

/** On Today: ads still online for a property that is sold, rented or withdrawn. */
export function StaleAds({ office, onGo, onCount }: { office: Office; onGo: (v: View) => void; onCount: (n: number) => void }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<{ id: string; site: Site; title: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { const r = await loadStaleAds(office.id); setRows(r); onCount(r.length); }, [office.id, onCount]);
  useEffect(() => { load(); }, [load]);
  if (rows.length === 0) return null;

  const done = async (id: string) => {
    if (busy) return;
    setBusy(id); setError(null);
    const err = await setRemoved({ id } as PostingRow);
    setBusy(null);
    if (err) setError(planError(err)); else load();
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t('Ads to take offline')} <span className="tabular text-base opacity-60">{rows.length}</span></h2>
        <button type="button" onClick={() => onGo('properties')} className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <p className="mb-2 text-xs text-muted">{t('These properties are no longer for sale or rent, but the ad is still online.')}</p>
      <ul className="space-y-2">
        {rows.slice(0, 6).map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
            <p className="min-w-0 truncate text-sm font-semibold">{r.title} <span className="font-normal text-muted">· {siteName(r.site)}</span></p>
            {canWrite && (
              <button type="button" disabled={busy !== null} onClick={() => done(r.id)}
                className="shrink-0 rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line/10 transition hover:text-brand disabled:opacity-40">{t('Taken offline')}</button>
            )}
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: rows.length - 6 })}</p>}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
