import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { dateText, daysTo, leaseError, type LeaseView } from '../lib/leases';
import { leaseStatusCls, leaseStatusLabel } from '../lib/labels';
import { planError } from '../lib/plan';
import { Btn, Modal } from '../components/ui';
import { ContactLinks } from '../components/ContactLinks';
import { RentPayments } from '../components/RentPayments';
import { LeaseForm } from './LeaseForm';

/** One lease: tenant, rent, dates, and the buttons to edit or end it. */
export function LeaseDetail({ office, item, onChanged, onClose }: { office: Office; item: LeaseView; onChanged: () => void; onClose: () => void }) {
  const { l, person, property } = item;
  const canWrite = office.role !== 'viewer';
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: 'active' | 'ended') => {
    if (busy) return;
    if (status === 'ended' && !window.confirm(t('End this lease? The property becomes available again.'))) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('leases').update({ status }).eq('id', l.id).select('id');
    setBusy(false);
    if (error) { const m = leaseError(error.message); setError(m ? t(m) : planError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return; }
    onChanged();
  };

  if (editing) return <LeaseForm orgId={office.id} lease={l} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;

  const left = l.status === 'active' && l.end_date ? daysTo(l.end_date) : null;
  return (
    <Modal title={<span className="block truncate">{person?.full_name ?? '…'}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        {canWrite && l.status === 'active' && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-4">
        <div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${leaseStatusCls[l.status]}`}>{leaseStatusLabel(l.status)}</span>
          <p className="font-display tabular mt-3 text-2xl font-bold">{formatMad(l.rent_cents)} <span className="text-base font-semibold text-muted">{t('/ month')}</span></p>
          <p className="mt-1 text-sm text-muted">{property ? <>{property.title} <span className="tabular">· {property.reference}</span></> : '…'}</p>
          {person && <div className="mt-3"><ContactLinks c={person} /></div>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t('Start date')}</dt><dd className="tabular font-semibold">{dateText(l.start_date)}</dd>
          <dt className="text-muted">{t('End date')}</dt><dd className="tabular font-semibold">{l.end_date ? dateText(l.end_date) : '—'}</dd>
          <dt className="text-muted">{t('Rent is due on day')}</dt><dd className="tabular font-semibold">{l.payment_day}</dd>
          <dt className="text-muted">{t('Deposit')}</dt><dd className="tabular font-semibold">{l.deposit_cents === null ? '—' : formatMad(l.deposit_cents)}</dd>
          {l.ended_on && <><dt className="text-muted">{t('Ended on')}</dt><dd className="tabular font-semibold">{dateText(l.ended_on)}</dd></>}
        </dl>
        {left !== null && left < 0 && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('The end date has passed. End the lease or set a new end date.')}</p>}
        {left !== null && left >= 0 && left <= 60 && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('This lease ends in {n} days.', { n: left })}</p>}
        {l.notes && <p className="whitespace-pre-line text-sm leading-relaxed">{l.notes}</p>}
        <RentPayments office={office} leaseId={l.id} startDate={l.start_date} person={person} propertyTitle={property?.title ?? ''} active={l.status === 'active'} onChanged={onChanged} />
        {canWrite && (
          <div>
            {l.status === 'active'
              ? <Btn tone="danger" disabled={busy} onClick={() => setStatus('ended')}>{t('End lease')}</Btn>
              : <Btn disabled={busy} onClick={() => setStatus('active')}>{t('Reopen lease')}</Btn>}
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
