import { useCallback, useEffect, useMemo, useState } from 'react';
import { Handshake, Plus, Search } from 'lucide-react';
import type { DealStage } from '@vastgoed/shared';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadDeals, type DealView } from '../lib/deals';
import { DEAL_STAGES, dealStageCls, dealStageLabel, priceSuffix } from '../lib/labels';
import { Btn, Card, inputCls } from '../components/ui';
import { DealForm } from './DealForm';
import { DealDetail } from './DealDetail';

type Filter = 'all' | DealStage;

const sum = (xs: DealView[]) => xs.reduce((n, x) => n + (x.d.commission_cents ?? 0), 0);

function Total({ label, cents, hint }: { label: string; cents: number; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
      <p className="tabular font-display text-xl font-bold">{formatMad(cents)}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Deals of the office: where each one stands, and what commission is expected or earned. */
export function Deals({ office }: { office: Office }) {
  const [rows, setRows] = useState<DealView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    try { setRows(await loadDeals(office.id)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.d.stage] = (c[r.d.stage] ?? 0) + 1;
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    const of = (...s: DealStage[]) => sum((rows ?? []).filter(r => s.includes(r.d.stage)));
    return { pending: of('offer', 'accepted'), toCollect: of('signed'), earned: of('paid') };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (filter === 'all' || r.d.stage === filter) &&
      (!needle || [r.person?.full_name, r.property?.title, r.property?.reference, r.d.notes].some(x => x?.toLowerCase().includes(needle))));
  }, [rows, filter, q]);

  const tabs: Filter[] = ['all', ...DEAL_STAGES.filter(s => (counts[s] ?? 0) > 0)];
  const opened = rows?.find(r => r.d.id === openId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Deals')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Start a deal')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Handshake className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No deals yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('When a lead makes an offer on a property, start a deal here: follow it to the signature and see your commission.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Start your first deal')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Total label={t('Expected')} cents={totals.pending} hint={t('Offer and accepted')} />
            <Total label={t('To collect')} cents={totals.toCollect} hint={t('Signed, not paid yet')} />
            <Total label={t('Earned')} cents={totals.earned} hint={t('Paid')} />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : dealStageLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
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
                {shown.map(({ d, person, property }) => (
                  <li key={d.id} role="button" tabIndex={0} aria-label={person?.full_name ?? ''}
                    onClick={() => setOpenId(d.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(d.id); } }}
                    className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display tabular text-base font-bold">{formatMad(d.price_cents)} <span className="text-sm font-semibold text-muted">{property ? priceSuffix(property.purpose) : ''}</span></p>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${dealStageCls[d.stage]}`}>{dealStageLabel(d.stage)}</span>
                    </div>
                    <h3 className="font-display mt-2 truncate text-lg font-semibold">{person?.full_name ?? '…'}</h3>
                    <p className="truncate text-sm text-muted">{property ? `${property.title} · ${property.reference}` : '…'}</p>
                    <p className="mt-2 text-xs font-semibold text-muted">{t('Commission')}: <span className="tabular">{d.commission_cents === null ? '—' : formatMad(d.commission_cents)}</span></p>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}

      {opened && <DealDetail key={opened.d.id} office={office} item={opened} onChanged={load} onClose={() => setOpenId(null)} />}
      {adding && <DealForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
