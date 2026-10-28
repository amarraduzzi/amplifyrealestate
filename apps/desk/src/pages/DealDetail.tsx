import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { DealStage } from '@vastgoed/shared';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { DealView } from '../lib/deals';
import { DEAL_STAGES, dealStageCls, dealStageLabel, priceSuffix } from '../lib/labels';
import { whenText } from '../lib/dates';
import { planError } from '../lib/plan';
import { Btn, Modal, inputCls } from '../components/ui';
import { ContactLinks } from '../components/ContactLinks';
import { DealDocuments } from '../components/DealDocuments';
import { DealSplits } from '../components/DealSplits';
import { DealInvoices } from '../components/DealInvoices';
import { DealForm } from './DealForm';

/** One deal: price, commission, how far it is, and the buttons to move it forward. */
export function DealDetail({ office, item, onChanged, onClose }: {
  office: Office; item: DealView; onChanged: () => void; onClose: () => void;
}) {
  const { d, person, property } = item;
  const canWrite = office.role !== 'viewer';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState('');

  const change = async (stage: DealStage, lost_reason: string | null = null) => {
    if (busy) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('deals').update(stage === 'lost' ? { stage, lost_reason } : { stage }).eq('id', d.id).select('id');
    setBusy(false);
    if (error) { setError(planError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return; }
    setLosing(false);
    onChanged();
  };

  const pick = (s: DealStage) => {
    if (s === d.stage) return;
    if (s === 'lost') { setLosing(true); return; }
    change(s);
  };

  if (editing) {
    return <DealForm orgId={office.id} deal={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;
  }

  return (
    <Modal title={<span className="block truncate">{person?.full_name ?? '…'}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        {canWrite && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-5">
        <div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dealStageCls[d.stage]}`}>{dealStageLabel(d.stage)}</span>
          <p className="font-display tabular mt-3 text-2xl font-bold">
            {formatMad(d.price_cents)} <span className="text-base font-semibold text-muted">{property ? priceSuffix(property.purpose) : ''}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {property ? <>{property.title} <span className="tabular">· {property.reference}</span></> : '…'}
          </p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{t('Commission')}: </span>
            <span className="tabular">{d.commission_cents === null ? '—' : formatMad(d.commission_cents)}</span>
            {d.commission_pct !== null && <span className="tabular text-muted"> ({d.commission_pct}%)</span>}
          </p>
          {person && <div className="mt-3"><ContactLinks c={person} /></div>}
          {d.notes && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{d.notes}</p>}
          {d.stage === 'lost' && d.lost_reason && <p className="mt-3 text-sm"><span className="font-semibold">{t('Reason')}: </span>{d.lost_reason}</p>}
          <p className="mt-3 text-xs text-muted">
            {t('Since {when}', { when: whenText(d.stage_changed_at) })}
            {d.signed_at && <> · {t('Signed {when}', { when: whenText(d.signed_at) })}</>}
            {d.paid_at && <> · {t('Paid {when}', { when: whenText(d.paid_at) })}</>}
          </p>
        </div>

        {canWrite && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Stage')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {DEAL_STAGES.map(s => (
                <button key={s} type="button" disabled={busy} aria-pressed={d.stage === s} onClick={() => pick(s)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${d.stage === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {dealStageLabel(s)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('Accepted reserves the property. Signed marks it as sold or rented and the lead as won.')}</p>
          </div>
        )}

        {canWrite && losing && (
          <div className="space-y-2 rounded-xl bg-surface-2 p-3">
            <label className="block text-sm font-semibold" htmlFor="lost-reason">{t('Why did it not go through?')}</label>
            <textarea id="lost-reason" className={inputCls} rows={2} value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Btn type="button" onClick={() => setLosing(false)}>{t('Cancel')}</Btn>
              <Btn tone="danger" type="button" disabled={busy} onClick={() => change('lost', reason.trim() || null)}>{t('Mark as lost')}</Btn>
            </div>
          </div>
        )}

        <DealSplits office={office} item={item} onChanged={onChanged} />

        <DealInvoices office={office} item={item} />

        {canWrite && <DealDocuments office={office} dealId={d.id} />}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
