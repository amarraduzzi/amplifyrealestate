import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bath, BedDouble, Building2, Download, ImageOff, Plus, Ruler, Search, Share2 } from 'lucide-react';
import { formatMad, type PropertyStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { STATUSES, priceSuffix, purposeLabel, statusLabel, typeLabel } from '../lib/labels';
import { Btn, Card, inputCls } from '../components/ui';
import { Confirmed } from '../components/Confirmed';
import { PropertyForm } from './PropertyForm';
import { PropertyDetail } from './PropertyDetail';
import { downloadCsv, propertiesCsv } from '../lib/exportCsv';
import { friendly } from '../lib/errors';
import { photoUrl } from '../lib/photos';
import { PUBLIC_SITE, propertyUrl, whatsappShareUrl } from '../lib/publicSite';
import { Hero, PhoneSheet } from '../components/Hero';

/** Solid status colors for the label on top of a photo (readable on any picture). */
const badgeCls: Record<PropertyStatus, string> = {
  available: 'bg-ok text-white',
  reserved: 'bg-warn text-white',
  rented: 'bg-qr text-white',
  sold: 'bg-surface-3 text-ink',
  draft: 'bg-night/80 text-white',
  withdrawn: 'bg-danger text-white',
};

type Filter = 'all' | PropertyStatus;

export function Properties({ office, userId }: { office: Office; userId: string }) {
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('properties').select('*').eq('org_id', office.id).order('created_at', { ascending: false });
    if (error) setError(friendly(error)); else { setError(null); setRows((data ?? []) as PropertyRow[]); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  // One cover photo per property: the cover first, otherwise the oldest. Small version (480 px) only.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let live = true;
    (async () => {
      const ids = rows.map(r => r.id);
      const out: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('property_photos').select('id, org_id, property_id, is_cover')
          .in('property_id', ids.slice(i, i + 100)).order('is_cover', { ascending: false }).order('created_at').order('id');
        for (const x of (data ?? []) as { id: string; org_id: string; property_id: string }[]) {
          if (!out[x.property_id]) out[x.property_id] = photoUrl(`${x.org_id}/${x.property_id}/${x.id}`, true);
        }
      }
      if (live) setCovers(out);
    })();
    return () => { live = false; };
  }, [rows]);

  /** WhatsApp message with the public link of one property (only for properties that are online). */
  const share = (r: PropertyRow) => {
    const price = r.price_cents === null ? '' : ` · ${formatMad(r.price_cents)} ${priceSuffix(r.purpose)}`.trimEnd();
    window.open(whatsappShareUrl(`${r.title}${price}\n${propertyUrl(office.slug, r.reference, 'fr')}`), '_blank', 'noopener');
  };

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

  const loading = rows === null;
  const exportBtn = (cls: string) => (
    <button type="button" title={t('Export to Excel')} aria-label={t('Export to Excel')}
      onClick={() => downloadCsv(`properties-${new Date().toISOString().slice(0, 10)}.csv`, propertiesCsv(shown))}
      className={cls}><Download className="h-4 w-4" /></button>
  );

  return (
    <>
    <Hero
      title={t('Properties')}
      sub={loading ? undefined : t('{n} in total', { n: counts.all })}
      action={shown.length > 0 ? exportBtn('grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition active:scale-90') : undefined}
      stats={[
        { value: loading ? '–' : counts.available ?? 0, label: statusLabel('available') },
        { value: loading ? '–' : counts.reserved ?? 0, label: statusLabel('reserved') },
        { value: loading ? '–' : (rows ?? []).filter(r => r.is_published).length, label: t('Online') },
      ]}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex items-center justify-between gap-3 max-lg:hidden">
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl font-bold sm:text-3xl">{t('Properties')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {shown.length > 0 && exportBtn('grid h-10 w-10 place-items-center rounded-full border border-line/[0.12] bg-surface text-muted transition hover:text-ink active:scale-95')}
          {canWrite && <span className="hidden sm:block"><Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add property')}</Btn></span>}
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {rows === null && !error && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <li key={i} className="card overflow-hidden rounded-3xl">
              <div className="skeleton aspect-[4/3] w-full lg:aspect-[16/10]" />
              <div className="space-y-2.5 p-4 sm:p-5">
                <div className="skeleton h-6 w-1/2 rounded-lg" />
                <div className="skeleton h-4 w-3/4 rounded-lg" />
                <div className="skeleton h-4 w-1/3 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      )}

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
            <div role="tablist" className="-mx-4 flex flex-nowrap gap-1.5 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95 ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : statusLabel(f)} <span className="tabular ms-0.5 text-[11px] opacity-60">{counts[f] ?? 0}</span>
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
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map(r => (
                  <li key={r.id} role="button" tabIndex={0} aria-label={r.title}
                    onClick={() => setOpenId(r.id)}
                    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(r.id); } }}
                    className="card lift rise min-w-0 cursor-pointer overflow-hidden rounded-3xl outline-none transition active:scale-[.985] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-brand">
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2 lg:aspect-[16/10]">
                      {covers[r.id]
                        ? <img src={covers[r.id]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-surface-2 to-surface-3 text-muted/50"><ImageOff className="h-8 w-8" /></div>}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-night/45 to-transparent max-lg:h-32 max-lg:from-night/80" />
                      <span className={`absolute start-3 top-3 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${badgeCls[r.status]}`}>{statusLabel(r.status)}</span>
                      {PUBLIC_SITE && r.is_published && (r.status === 'available' || r.status === 'reserved') && (
                        <button type="button" onClick={e => { e.stopPropagation(); share(r); }} aria-label={t('Share')} title={t('Share')}
                          className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition active:scale-90 hover:bg-white"><Share2 className="h-4 w-4" /></button>
                      )}
                      <span className="absolute bottom-3 start-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-ink backdrop-blur max-lg:hidden">{purposeLabel(r.purpose)}</span>
                      {/* phone and tablet: the price sits on the photo */}
                      <div className="pointer-events-none absolute inset-x-4 bottom-3.5 text-white lg:hidden">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/75">{purposeLabel(r.purpose)}</p>
                        <p className="flex items-baseline gap-x-1.5">
                          <span className="font-display tabular truncate text-[1.7rem] font-bold leading-tight">{formatMad(r.price_cents)}</span>
                          {priceSuffix(r.purpose) && <span className="shrink-0 text-sm font-semibold text-white/80">{priceSuffix(r.purpose)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0 p-4 sm:p-5">
                      <p className="flex items-baseline gap-x-1.5 max-lg:hidden">
                        <span className="font-display tabular truncate text-2xl font-bold leading-none">{formatMad(r.price_cents)}</span>
                        {priceSuffix(r.purpose) && <span className="shrink-0 text-sm font-semibold text-muted">{priceSuffix(r.purpose)}</span>}
                      </p>
                      <h3 className="font-display truncate text-base font-semibold lg:mt-2">{r.title}</h3>
                      <p className="truncate text-sm text-muted">
                        {[r.neighborhood, r.city].filter(Boolean).join(', ') || '—'} · {typeLabel(r.property_type)}
                      </p>
                      <div className="mt-3 flex items-center gap-x-4 text-sm text-muted">
                        {r.bedrooms !== null && <span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{r.bedrooms}</span>}
                        {r.bathrooms !== null && <span className="inline-flex items-center gap-1.5"><Bath className="h-4 w-4" />{r.bathrooms}</span>}
                        {r.area_m2 !== null && <span className="inline-flex items-center gap-1.5"><Ruler className="h-4 w-4" />{r.area_m2} m²</span>}
                        <span className="tabular ms-auto min-w-0 truncate text-xs">{r.reference}</span>
                      </div>
                      <div className="mt-3 border-t border-line/[0.07] pt-3"><Confirmed iso={r.info_confirmed_at} /></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}

      {canWrite && rows !== null && rows.length > 0 && !openId && !adding && (
        <button type="button" onClick={() => setAdding(true)} aria-label={t('Add property')} title={t('Add property')}
          className="gold-fill fixed end-4 z-20 grid h-14 w-14 place-items-center rounded-full text-brand-ink transition active:scale-90 sm:hidden"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}>
          <Plus className="h-6 w-6" />
        </button>
      )}

      {openId && (() => {
        const open = (rows ?? []).find(r => r.id === openId);
        return open ? <PropertyDetail key={open.id} office={office} userId={userId} row={open} onChanged={load} onClose={() => setOpenId(null)} /> : null;
      })()}

      {adding && <PropertyForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
    </PhoneSheet>
    </>
  );
}
