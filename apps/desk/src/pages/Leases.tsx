import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Search } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { LeaseStatus, Office } from '../lib/types';
import { daysTo, dateText, loadLeases, type LeaseView } from '../lib/leases';
import { LEASE_STATUSES, leaseStatusCls, leaseStatusLabel } from '../lib/labels';
import { Btn, Card, inputCls } from '../components/ui';
import { LeaseForm } from './LeaseForm';
import { LeaseDetail } from './LeaseDetail';

type Filter = 'all' | LeaseStatus;

function Total({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className="tabular font-display text-xl font-bold">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Rentals of the office: who rents what, for how much, and which leases end soon. */
export function Leases({ office }: { office: Office }) {
  const [rows, setRows] = useState<LeaseView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    try { setRows(await loadLeases(office.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const stats = useMemo(() => {
    const active = (rows ?? []).filter(r => r.l.status === 'active');
    return {
      active: active.length,
      monthly: active.reduce((n, r) => n + r.l.rent_cents, 0),
      ending: active.filter(r => r.l.end_date !== null && daysTo(r.l.end_date) <= 60).length,
    };
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.l.status] = (c[r.l.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (filter === 'all' || r.l.status === filter) &&
      (!needle || [r.person?.full_name, r.property?.title, r.property?.reference, r.l.notes].some(x => x?.toLowerCase().includes(needle))));
  }, [rows, filter, q]);

  const opened = rows?.find(r => r.l.id === openId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Rentals')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Start a lease')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><KeyRound className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No leases yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('When a property is rented out, record the tenant, the rent and the dates here. The property is marked as rented automatically.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Start your first lease')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Total label={t('Running leases')} value={String(stats.active)} hint={t('Properties that are rented out now')} />
            <Total label={t('Monthly rent')} value={formatMad(stats.monthly)} hint={t('Total of the running leases')} />
            <Total label={t('Ending soon')} value={String(stats.ending)} hint={t('Within 60 days, or past the end date')} />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {(['all', ...LEASE_STATUSES] as Filter[]).map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : leaseStatusLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
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
                {shown.map(({ l, person, property }) => {
                  const left = l.status === 'active' && l.end_date ? daysTo(l.end_date) : null;
                  return (
                    <li key={l.id} role="button" tabIndex={0} aria-label={person?.full_name ?? ''}
                      onClick={() => setOpenId(l.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(l.id); } }}
                      className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display tabular text-base font-bold">{formatMad(l.rent_cents)} <span className="text-sm font-semibold text-muted">{t('/ month')}</span></p>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${leaseStatusCls[l.status]}`}>{leaseStatusLabel(l.status)}</span>
                      </div>
                      <h3 className="font-display mt-2 truncate text-lg font-semibold">{person?.full_name ?? '…'}</h3>
                      <p className="truncate text-sm text-muted">{property ? `${property.title} · ${property.reference}` : '…'}</p>
                      <p className={`mt-2 text-xs font-semibold ${left !== null && left <= 60 ? 'text-warn' : 'text-muted'}`}>
                        {l.end_date ? t('Until {date}', { date: dateText(l.end_date) }) : t('From {date}', { date: dateText(l.start_date) })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
        </>
      )}

      {opened && <LeaseDetail key={opened.l.id} office={office} item={opened} onChanged={load} onClose={() => setOpenId(null)} />}
      {adding && <LeaseForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
