import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bath, BedDouble, Building2, Download, Plus, Ruler, Search } from 'lucide-react';
import { formatMad, type PropertyStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { STATUSES, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/labels';
import { Btn, Card, inputCls } from '../components/ui';
import { Confirmed } from '../components/Confirmed';
import { PropertyForm } from './PropertyForm';
import { PropertyDetail } from './PropertyDetail';
import { downloadCsv, propertiesCsv } from '../lib/exportCsv';
import { friendly } from '../lib/errors';

type Filter = 'all' | PropertyStatus;

export function Properties({ office, userId }: { office: Office; userId: string }) {
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('properties').select('*').eq('org_id', office.id).order('created_at', { ascending: false });
    if (error) setError(friendly(error)); else { setError(null); setRows((data ?? []) as PropertyRow[]); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (filter === 'all' || r.status === filter) &&
      (!needle || [r.title, r.neighborhood, r.city, r.reference].some(x => x?.toLowerCase().includes(needle))));
  }, [rows, filter, q]);

  const tabs: Filter[] = ['all', ...STATUSES.filter(s => (counts[s] ?? 0) > 0 || s === 'available')];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Properties')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shown.length > 0 && <Btn tone="ghost" onClick={() => downloadCsv(`properties-${new Date().toISOString().slice(0, 10)}.csv`, propertiesCsv(shown))}><Download className="h-4 w-4" /> {t('Export to Excel')}</Btn>}
          {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add property')}</Btn>}
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Building2 className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No properties yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Add your first property. Every price and status change from then on is recorded.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add your first property')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : statusLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
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
                {shown.map(r => (
                  <li key={r.id} role="button" tabIndex={0} aria-label={r.title}
                    onClick={() => setOpenId(r.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(r.id); } }}
                    className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display truncate text-lg font-semibold">{r.title}</h3>
                        <p className="truncate text-sm text-muted">
                          {[r.neighborhood, r.city].filter(Boolean).join(', ') || '—'} · {typeLabel(r.property_type)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusCls[r.status]}`}>{statusLabel(r.status)}</span>
                    </div>
                    <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display tabular text-xl font-bold">{formatMad(r.price_cents)}</span>
                      <span className="text-sm text-muted">{priceSuffix(r.purpose)}</span>
                      <span className="ms-auto rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{purposeLabel(r.purpose)}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                      {r.bedrooms !== null && <span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{r.bedrooms}</span>}
                      {r.bathrooms !== null && <span className="inline-flex items-center gap-1.5"><Bath className="h-4 w-4" />{r.bathrooms}</span>}
                      {r.area_m2 !== null && <span className="inline-flex items-center gap-1.5"><Ruler className="h-4 w-4" />{r.area_m2} m²</span>}
                      <span className="tabular ms-auto text-xs">{r.reference}</span>
                    </div>
                    <div className="mt-3 border-t border-line/[0.07] pt-3"><Confirmed iso={r.info_confirmed_at} /></div>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}

      {openId && (() => {
        const open = (rows ?? []).find(r => r.id === openId);
        return open ? <PropertyDetail key={open.id} office={office} userId={userId} row={open} onChanged={load} onClose={() => setOpenId(null)} /> : null;
      })()}

      {adding && <PropertyForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
