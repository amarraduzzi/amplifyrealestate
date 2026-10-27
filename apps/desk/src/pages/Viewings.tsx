import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, Search } from 'lucide-react';
import type { ViewingStatus } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadViewings, type ViewingView } from '../lib/viewings';
import { VIEWING_STATUSES, outcomeCls, outcomeLabel, viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { whenText } from '../lib/dates';
import { Btn, Card, inputCls } from '../components/ui';
import { ViewingForm } from './ViewingForm';
import { ViewingDetail } from './ViewingDetail';

type Filter = 'all' | ViewingStatus;

export function Viewings({ office }: { office: Office }) {
  const [rows, setRows] = useState<ViewingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('scheduled');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    try { setRows(await loadViewings(office.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.v.status] = (c[r.v.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter(r =>
      (filter === 'all' || r.v.status === filter) &&
      (!needle || [r.person?.full_name, r.property?.title, r.property?.reference, r.v.notes].some(x => x?.toLowerCase().includes(needle))));
    // Planned viewings: next one first. Everything else: most recent first.
    const upcoming = filter === 'scheduled';
    return list.sort((a, b) => (upcoming ? 1 : -1) * a.v.scheduled_at.localeCompare(b.v.scheduled_at));
  }, [rows, filter, q]);

  const tabs: Filter[] = ['all', ...VIEWING_STATUSES.filter(s => (counts[s] ?? 0) > 0 || s === 'scheduled')];
  const opened = rows?.find(r => r.v.id === openId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Viewings')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><CalendarPlus className="h-4 w-4" /> {t('Schedule a viewing')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><CalendarClock className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No viewings yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Schedule an appointment between a lead and a property, and note how it went afterwards.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><CalendarPlus className="h-4 w-4" /> {t('Schedule your first viewing')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : viewingStatusLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:ms-auto sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} ps-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
            </div>
          </div>

          {shown.length === 0
            ? <p className="mt-10 text-center text-muted">{filter === 'scheduled' && !q ? t('No viewings planned.') : t('Nothing matches.')}</p>
            : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {shown.map(({ v, person, property }) => {
                  const overdue = v.status === 'scheduled' && new Date(v.scheduled_at).getTime() < Date.now();
                  return (
                    <li key={v.id} role="button" tabIndex={0} aria-label={person?.full_name ?? ''}
                      onClick={() => setOpenId(v.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(v.id); } }}
                      className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`font-display tabular text-base font-bold ${overdue ? 'text-warn' : ''}`}>{whenText(v.scheduled_at)}</p>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {v.outcome && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${outcomeCls[v.outcome]}`}>{outcomeLabel(v.outcome)}</span>}
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${viewingStatusCls[v.status]}`}>{viewingStatusLabel(v.status)}</span>
                        </span>
                      </div>
                      <h3 className="font-display mt-2 truncate text-lg font-semibold">{person?.full_name ?? '…'}</h3>
                      <p className="truncate text-sm text-muted">{property ? `${property.title} · ${property.reference}` : '…'}</p>
                      {overdue && <p className="mt-2 text-xs font-semibold text-warn">{t('The time has passed. Mark how it went.')}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
        </>
      )}

      {opened && <ViewingDetail key={opened.v.id} office={office} item={opened} onChanged={load} onClose={() => setOpenId(null)} />}
      {adding && <ViewingForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
