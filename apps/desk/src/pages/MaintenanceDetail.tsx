import { useState } from 'react';
import { MessageCircle, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { dateText } from '../lib/leases';
import { costByLabel, costText, maintStatusCls, maintStatusLabel, priorityCls, priorityLabel, repairMessage, type MaintStatus, type MaintView } from '../lib/maintenance';
import { SHARE_LANGS, type ShareLang } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { Btn, Modal } from '../components/ui';
import { ContactLinks, waLink } from '../components/ContactLinks';
import { MaintenanceForm } from './MaintenanceForm';

/** One request: what, where, who, cost, and the buttons that move it forward. */
export function MaintenanceDetail({ office, item, onChanged, onClose }: { office: Office; item: MaintView; onChanged: () => void; onClose: () => void }) {
  const { m, property, reporter, contractor } = item;
  const canWrite = office.role !== 'viewer';
  const [editing, setEditing] = useState(false);
  const [lang, setLang] = useState<ShareLang>('fr');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: MaintStatus) => {
    if (busy) return;
    if (status === 'cancelled' && !window.confirm(t('Cancel this request? It stays in the list.'))) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('maintenance_requests').update({ status }).eq('id', m.id).select('id');
    setBusy(false);
    if (error) { setError(planError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return; }
    onChanged();
  };

  const send = () => {
    if (!contractor) return;
    const name = contractor.full_name.trim().split(/\s+/)[0] || '';
    const text = repairMessage({ lang, name, property: property?.title ?? '', m, office: office.name });
    const number = contractor.whatsapp || contractor.phone;
    window.open(number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  if (editing) return <MaintenanceForm orgId={office.id} item={m} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;

  return (
    <Modal title={<span className="block truncate">{m.title}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        {canWrite && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${maintStatusCls[m.status]}`}>{maintStatusLabel(m.status)}</span>
          {m.priority === 'urgent' && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityCls.urgent}`}>{priorityLabel('urgent')}</span>}
        </div>
        <p className="text-sm text-muted">{property ? <>{property.title} <span className="tabular">· {property.reference}</span></> : '…'}</p>
        {m.description && <p className="whitespace-pre-line text-sm leading-relaxed">{m.description}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t('Reported on')}</dt><dd className="tabular font-semibold">{dateText(m.reported_on)}</dd>
          {m.done_on && <><dt className="text-muted">{t('Done on')}</dt><dd className="tabular font-semibold">{dateText(m.done_on)}</dd></>}
          <dt className="text-muted">{t('Cost')}</dt>
          <dd className="tabular font-semibold">{costText(m)}{m.cost_borne_by && <span className="font-normal text-muted"> · {costByLabel(m.cost_borne_by)}</span>}</dd>
        </dl>

        {reporter && <div><p className="mb-1 text-xs font-semibold text-muted">{t('Reported by')}</p><p className="text-sm font-semibold">{reporter.full_name}</p><div className="mt-1"><ContactLinks c={reporter} /></div></div>}
        {contractor && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
            <p className="text-xs font-semibold text-muted">{t('Repairer')}</p>
            <p className="text-sm font-semibold">{contractor.full_name}</p>
            <ContactLinks c={contractor} />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Language of the message')}>
              {SHARE_LANGS.map(l => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
              ))}
              <button type="button" onClick={send} className="ms-1 inline-flex items-center gap-1.5 rounded-xl bg-ok/10 px-3 py-1.5 text-sm font-semibold text-ok transition hover:bg-ok/15"><MessageCircle className="h-4 w-4" /> {t('Send to repairer')}</button>
            </div>
          </div>
        )}

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {m.status === 'open' && <Btn disabled={busy} onClick={() => setStatus('in_progress')}>{t('Start work')}</Btn>}
            {(m.status === 'open' || m.status === 'in_progress') && <Btn tone="brand" disabled={busy} onClick={() => setStatus('done')}>{t('Mark as done')}</Btn>}
            {m.status === 'in_progress' && <Btn disabled={busy} onClick={() => setStatus('open')}>{t('Back to open')}</Btn>}
            {(m.status === 'done' || m.status === 'cancelled') && <Btn disabled={busy} onClick={() => setStatus('open')}>{t('Reopen request')}</Btn>}
            {(m.status === 'open' || m.status === 'in_progress') && <Btn tone="danger" disabled={busy} onClick={() => setStatus('cancelled')}>{t('Cancel request')}</Btn>}
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
