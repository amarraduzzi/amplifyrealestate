import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bath, BedDouble, FileText, Pencil, Ruler, ShieldCheck } from 'lucide-react';
import { formatMad, type PropertyStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { HistoryRow, Office, PropertyRow } from '../lib/types';
import { STATUSES, daysSince, priceSuffix, purposeLabel, statusCls, statusLabel, typeLabel } from '../lib/labels';
import { Btn, Modal } from '../components/ui';
import { Confirmed } from '../components/Confirmed';
import { PropertyForm } from './PropertyForm';
import { PropertyParties } from './PropertyParties';
import { PropertyMandates } from './PropertyMandates';
import { PropertyLeads } from './PropertyLeads';
import { PhotosSection } from './PhotosSection';
import { PublishSection } from './PublishSection';
import { PostingSection } from './PostingSection';
import { NetworkShare } from '../components/NetworkShare';
import { OwnerReport } from './OwnerReport';
import { ViewingsSection } from './ViewingsSection';
import { TasksSection } from './TasksSection';
import { planError } from '../lib/plan';
import { friendly } from '../lib/errors';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const when = (iso: string) =>
  new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** A confirmation that came with a price or status change in the same moment is shown only once. */
function tidy(rows: HistoryRow[]): HistoryRow[] {
  const others = rows.filter(r => r.field !== 'info_confirmed_at').map(r => new Date(r.changed_at).getTime());
  return rows.filter(r => r.field !== 'info_confirmed_at' || !others.some(o => Math.abs(o - new Date(r.changed_at).getTime()) < 3000));
}

function eventText(r: HistoryRow): string {
  const status = (v: string | null) => (v ? statusLabel(v as PropertyStatus) : '—');
  const price = (v: string | null) => (v === null ? '—' : formatMad(Number(v)));
  switch (r.field) {
    case 'created': return t('Added as {status}', { status: status(r.new_value) });
    case 'status': return t('Status changed from {from} to {to}', { from: status(r.old_value), to: status(r.new_value) });
    case 'price_cents': return t('Price changed from {from} to {to}', { from: price(r.old_value), to: price(r.new_value) });
    case 'info_confirmed_at': return t('Price and availability confirmed');
    case 'is_published': return r.new_value === 'true' ? t('Public page switched on') : t('Public page switched off');
    default: return r.field;
  }
}

export function PropertyDetail({ office, userId, row, onChanged, onClose }: {
  office: Office; userId: string; row: PropertyRow; onChanged: () => void; onClose: () => void;
}) {
  const canWrite = office.role !== 'viewer';
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(false);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase.from('property_status_history')
      .select('id, changed_by, changed_at, field, old_value, new_value')
      .eq('property_id', row.id)
      .order('changed_at', { ascending: false }).order('id', { ascending: false });
    if (error) setError(friendly(error)); else setHistory((data ?? []) as HistoryRow[]);
  }, [row.id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const events = useMemo(() => tidy(history ?? []), [history]);

  const confirm = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('confirm_property_info', { p_property: row.id });
    setBusy(false);
    if (error) setError(planError(error.message)); else { onChanged(); loadHistory(); }
  };

  const changeStatus = async (s: PropertyStatus) => {
    if (s === row.status || busy) return;
    if (s === 'withdrawn' && !window.confirm(t('Withdraw this property? It stays in your list and in the history.'))) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('properties').update({ status: s }).eq('id', row.id).select('id');
    if (error) { setBusy(false); setError(planError(error.message)); return; }
    if (!data?.length) { setBusy(false); setError(t('You do not have permission to change this property.')); return; }
    // A status change is also a fresh confirmation.
    const r = await supabase.rpc('confirm_property_info', { p_property: row.id });
    setBusy(false);
    if (r.error) setError(friendly(r.error));
    onChanged(); loadHistory();
  };

  if (editing) {
    return <PropertyForm orgId={office.id} property={row} onClose={() => setEditing(false)}
      onSaved={() => { setEditing(false); onChanged(); loadHistory(); }} />;
  }

  const stale = (daysSince(row.info_confirmed_at) ?? 0) > 30;
  const place = [row.neighborhood, row.city].filter(Boolean).join(', ');

  return (
    <Modal title={<span className="block truncate">{row.title}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <Btn onClick={() => setReport(true)}><FileText className="h-4 w-4" /> {t('Owner report')}</Btn>
        {canWrite && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusCls[row.status]}`}>{statusLabel(row.status)}</span>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{purposeLabel(row.purpose)}</span>
            <span className="tabular ms-auto text-xs text-muted">{row.reference}</span>
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display tabular text-3xl font-bold">{formatMad(row.price_cents)}</span>
            <span className="text-sm text-muted">{priceSuffix(row.purpose)}</span>
          </p>
          <p className="mt-1 text-sm text-muted">{[place, typeLabel(row.property_type)].filter(Boolean).join(' · ')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
          {row.bedrooms !== null && <span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{row.bedrooms}</span>}
          {row.bathrooms !== null && <span className="inline-flex items-center gap-1.5"><Bath className="h-4 w-4" />{row.bathrooms}</span>}
          {row.area_m2 !== null && <span className="inline-flex items-center gap-1.5"><Ruler className="h-4 w-4" />{Number(row.area_m2)} m²</span>}
          {row.furnished !== null && <span>{row.furnished ? t('Furnished') : t('Unfurnished')}</span>}
        </div>

        {row.description && <p className="whitespace-pre-line text-sm leading-relaxed">{row.description}</p>}

        <div className="rounded-2xl bg-surface-2 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Confirmed iso={row.info_confirmed_at} />
              {stale && <p className="mt-0.5 text-xs text-muted">{t('Check the price and availability with the owner.')}</p>}
            </div>
            {canWrite && <Btn tone="ghost" onClick={confirm} disabled={busy}><ShieldCheck className="h-4 w-4" /> {t('Confirm price and availability')}</Btn>}
          </div>
        </div>

        {canWrite && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Status')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(s => (
                <button key={s} type="button" disabled={busy} aria-pressed={row.status === s} onClick={() => changeStatus(s)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${row.status === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

        {report && <OwnerReport office={office} property={row} onClose={() => setReport(false)} />}
        <PropertyParties office={office} property={row} canWrite={canWrite} />
        <PropertyMandates office={office} property={row} canWrite={canWrite} />
        <PhotosSection office={office} property={row} canWrite={canWrite} onChanged={onChanged} />
        <PublishSection office={office} property={row} canWrite={canWrite} onChanged={() => { onChanged(); loadHistory(); }} />
        <PostingSection office={office} property={row} canWrite={canWrite} />
        <NetworkShare office={office} property={row} canWrite={canWrite} />
        <PropertyLeads office={office} property={row} />
        <ViewingsSection office={office} property={row} />
        <TasksSection office={office} userId={userId} property={row} />

        <div>
          <h3 className="mb-3 text-sm font-semibold">{t('History')}</h3>
          {history === null && !error && <p className="text-sm text-muted">…</p>}
          {history !== null && events.length === 0 && <p className="text-sm text-muted">{t('No changes recorded yet.')}</p>}
          {events.length > 0 && (
            <ol className="ms-1.5 border-s border-line/[0.12]">
              {events.map(r => (
                <li key={r.id} className="relative pb-4 ps-5 last:pb-0">
                  <span className="absolute -start-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-surface" />
                  <p className="text-sm font-semibold">{eventText(r)}</p>
                  <p className="text-xs text-muted">
                    {when(r.changed_at)}
                    {r.changed_by && ` · ${r.changed_by === userId ? t('You') : t('Team member')}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}
