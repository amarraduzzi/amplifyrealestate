import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Wrench } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { dateText } from '../lib/leases';
import { MAINT_STATUSES, isOpen, loadMaintenance, maintStatusCls, maintStatusLabel, priorityCls, priorityLabel, type MaintStatus, type MaintView } from '../lib/maintenance';
import { Btn, Card, inputCls } from '../components/ui';
import { MaintenanceForm } from './MaintenanceForm';
import { MaintenanceDetail } from './MaintenanceDetail';

type Filter = 'active' | 'all' | MaintStatus;

function Total({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className="tabular font-display text-xl font-bold">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Problems and repairs at the properties of the office: what is open, how urgent, who fixes it, what it costs. */
export function Maintenance({ office }: { office: Office }) {
  const [rows, setRows] = useState<MaintView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    try { setRows(await loadMaintenance(office.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const open = all.filter(r => isOpen(r.m.status));
    return {
      open: open.length,
      urgent: open.filter(r => r.m.priority === 'urgent').length,
      cost: all.filter(r => r.m.status === 'done').reduce((n, r) => n + (r.m.cost_cents ?? 0), 0),
    };
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0, active: stats.open };
    for (const r of rows ?? []) c[r.m.status] = (c[r.m.status] ?? 0) + 1;
    return c;
  }, [rows, stats.open]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = { urgent: 0, normal: 1, low: 2 } as const;
    return (rows ?? [])
      .filter(r => (filter === 'all' || (filter === 'active' ? isOpen(r.m.status) : r.m.status === filter)) &&
        (!needle || [r.m.title, r.m.description, r.property?.title, r.property?.reference, r.contractor?.full_name, r.reporter?.full_name].some(x => x?.toLowerCase().includes(needle))))
      .sort((a, b) => (isOpen(a.m.status) && isOpen(b.m.status) ? rank[a.m.priority] - rank[b.m.priority] : 0));
  }, [rows, filter, q]);

  const opened = rows?.find(r => r.m.id === openId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Maintenance')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Report a problem')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Wrench className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No maintenance requests yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Note what is broken at a property, who reported it and who fixes it, and follow it until it is done.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Report the first problem')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Total label={t('Open requests')} value={String(stats.open)} hint={t('Open or in progress')} />
            <Total label={t('Urgent')} value={String(stats.urgent)} hint={t('Open and marked urgent')} />
            <Total label={t('Repair costs')} value={formatMad(stats.cost)} hint={t('Of finished requests')} />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {(['active', 'done', 'cancelled', 'all'] as Filter[]).map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : f === 'active' ? t('Open') : maintStatusLabel(f as MaintStatus)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:ms-auto sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} ps-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
            </div>
          </div>

          {shown.length === 0
            ? <p className="mt-10 text-center text-muted">{t('Nothing matches.')}</p>
            : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {shown.map(({ m, property, contractor }) => (
                  <li key={m.id} role="button" tabIndex={0} aria-label={m.title}
                    onClick={() => setOpenId(m.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(m.id); } }}
                    className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display min-w-0 truncate text-lg font-semibold">{m.title}</h3>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {m.priority === 'urgent' && isOpen(m.status) && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityCls.urgent}`}>{priorityLabel('urgent')}</span>}
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${maintStatusCls[m.status]}`}>{maintStatusLabel(m.status)}</span>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{property ? `${property.title} · ${property.reference}` : '…'}</p>
                    <p className="mt-2 text-xs font-semibold text-muted">
                      {t('Reported on')} {dateText(m.reported_on)}{contractor ? ` · ${contractor.full_name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}

      {opened && <MaintenanceDetail key={opened.m.id} office={office} item={opened} onChanged={load} onClose={() => setOpenId(null)} />}
      {adding && <MaintenanceForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
