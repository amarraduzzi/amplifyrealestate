import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Wrench } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import { Hero, madShort, PhoneSheet } from '../components/Hero';
import { AccentRow, type Tone } from '../components/Rows';
import type { Office } from '../lib/types';
import { dateText } from '../lib/leases';
import { isOpen, loadMaintenance, maintStatusCls, maintStatusLabel, priorityCls, priorityLabel, type MaintStatus, type MaintView } from '../lib/maintenance';
import { Btn, inputCls, EmptyState } from '../components/ui';
import { MaintenanceForm } from './MaintenanceForm';
import { MaintenanceDetail } from './MaintenanceDetail';
import { friendly } from '../lib/errors';

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
    catch (e) { setError(friendly(e)); }
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
    <>
    <Hero
      title={t('Maintenance')}
      sub={rows ? t('{n} in total', { n: counts.all }) : undefined}
      action={(<div className="flex items-center gap-2">
        {canWrite && <button type="button" onClick={() => setAdding(true)} aria-label={t('Report a problem')} title={t('Report a problem')} className="grid h-11 w-11 place-items-center rounded-full bg-night-2 text-white ring-1 ring-white/20 transition active:scale-90 disabled:opacity-40"><Plus className="h-5 w-5" /></button>}
      </div>)}
      stats={[
        { value: (rows === null) ? '–' : stats.open, label: t('Open requests') },
        { value: (rows === null) ? '–' : stats.urgent, label: t('Urgent'), warn: !(rows === null) && stats.urgent > 0 },
        { value: (rows === null) ? '–' : madShort(stats.cost), label: t('Repair costs') },
      ]}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3 max-lg:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Maintenance')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Report a problem')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <EmptyState className="mt-6" icon={Wrench} title={t('No maintenance requests yet')} text={t('Note what is broken at a property, who reported it and who fixes it, and follow it until it is done.')} action={canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Report the first problem')}</Btn>} />
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 max-lg:hidden">
            <Total label={t('Open requests')} value={String(stats.open)} hint={t('Open or in progress')} />
            <Total label={t('Urgent')} value={String(stats.urgent)} hint={t('Open and marked urgent')} />
            <Total label={t('Repair costs')} value={formatMad(stats.cost)} hint={t('Of finished requests')} />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="-mx-4 flex flex-nowrap gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {(['active', 'done', 'cancelled', 'all'] as Filter[]).map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : f === 'active' ? t('Still open') : maintStatusLabel(f as MaintStatus)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
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
                {shown.map(({ m, property, contractor }, i) => {
                  const urgent = m.priority === 'urgent' && isOpen(m.status);
                  const tone: Tone = urgent ? 'danger' : isOpen(m.status) ? 'warn' : m.status === 'done' ? 'ok' : 'muted';
                  return (
                  <AccentRow key={m.id} tone={tone} index={i} label={m.title} onOpen={() => setOpenId(m.id)}>
                    <h3 className="font-display truncate text-base font-semibold">{m.title}</h3>
                    <p className="mt-0.5 truncate text-sm text-muted">{property ? `${property.title} · ${property.reference}` : '…'}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {urgent && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityCls.urgent}`}>{priorityLabel('urgent')}</span>}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${maintStatusCls[m.status]}`}>{maintStatusLabel(m.status)}</span>
                      <span className="ms-auto min-w-0 truncate text-xs font-semibold text-muted">{t('Reported on')} {dateText(m.reported_on)}{contractor ? ` · ${contractor.full_name}` : ''}</span>
                    </div>
                  </AccentRow>
                  );
                })}
              </ul>
            )}
        </>
      )}

      {opened && <MaintenanceDetail key={opened.m.id} office={office} item={opened} onChanged={load} onClose={() => setOpenId(null)} />}
      {adding && <MaintenanceForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
    </PhoneSheet>
    </>
  );
}
