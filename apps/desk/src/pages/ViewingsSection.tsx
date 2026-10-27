import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PropertyRow } from '../lib/types';
import { loadViewings, type ViewingView } from '../lib/viewings';
import { OPEN_LEAD_STATUSES, outcomeCls, outcomeLabel, viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { whenText } from '../lib/dates';
import { Btn } from '../components/ui';
import { ViewingForm } from './ViewingForm';
import { ViewingDetail } from './ViewingDetail';

/**
 * The viewings of one lead or one property, with a button to schedule a new one.
 * Used inside the lead screen and the property screen.
 */
export function ViewingsSection({ office, lead, property, onChanged }: {
  office: Office; lead?: LeadRow; property?: PropertyRow; onChanged?: () => void;
}) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<ViewingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const leadId = lead?.id, propertyId = property?.id;
  const reload = useCallback(async () => {
    try {
      const list = await loadViewings(office.id, { leadId, propertyId });
      setError(null); setRows(list.sort((a, b) => b.v.scheduled_at.localeCompare(a.v.scheduled_at)));
    } catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id, leadId, propertyId]);
  useEffect(() => { reload(); }, [reload]);

  const changed = () => { reload(); onChanged?.(); };

  // Scheduling only makes sense while the lead is still looking, or while the property can still be shown.
  const canSchedule = canWrite && (lead ? OPEN_LEAD_STATUSES.includes(lead.status) : property ? property.status === 'available' || property.status === 'reserved' : false);
  const opened = rows?.find(x => x.v.id === openId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('Viewings')} {rows && <span className="tabular opacity-60">{rows.length}</span>}</h3>
        {canSchedule && <Btn tone="ghost" className="!px-3 !py-1.5" onClick={() => setAdding(true)}><CalendarPlus className="h-4 w-4" /> {t('Schedule')}</Btn>}
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="text-sm text-muted">…</p>}
      {rows !== null && rows.length === 0 && !error && <p className="text-sm text-muted">{t('No viewings yet.')}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(({ v, person, property: prop }) => (
            <li key={v.id}>
              <button type="button" onClick={() => setOpenId(v.id)}
                className="block w-full rounded-2xl bg-surface-2 px-3.5 py-3 text-start transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand">
                <div className="flex items-start justify-between gap-3">
                  <p className="tabular text-sm font-semibold">{whenText(v.scheduled_at)}</p>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {v.outcome && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${outcomeCls[v.outcome]}`}>{outcomeLabel(v.outcome)}</span>}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${viewingStatusCls[v.status]}`}>{viewingStatusLabel(v.status)}</span>
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{lead ? (prop?.title ?? '…') : (person?.full_name ?? '…')}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && <ViewingForm orgId={office.id} leadId={leadId} propertyId={propertyId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(); }} />}
      {opened && <ViewingDetail key={opened.v.id} office={office} item={opened} onChanged={changed} onClose={() => setOpenId(null)} />}
    </div>
  );
}
