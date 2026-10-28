import { useState } from 'react';
import { PhoneCall, Pencil } from 'lucide-react';
import type { LeadStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PersonRow } from '../lib/types';
import { LEAD_STATUSES, leadStatusCls, leadStatusLabel, purposeLabel, sourceLabel } from '../lib/labels';
import type { MatchProp } from '../lib/matching';
import { Btn, Modal } from '../components/ui';
import { ContactLinks } from '../components/ContactLinks';
import { SendMatches } from '../components/SendMatches';
import { ContactAge } from '../components/ContactAge';
import { budgetText, criteriaText } from '../components/leadText';
import { LeadForm } from './LeadForm';
import { ViewingsSection } from './ViewingsSection';
import { TasksSection } from './TasksSection';
import { friendly } from '../lib/errors';

export function LeadDetail({ office, userId, lead, person, matches, onChanged, onClose }: {
  office: Office; userId: string; lead: LeadRow; person: PersonRow | undefined; matches: MatchProp[]; onChanged: () => void; onClose: () => void;
}) {
  const canWrite = office.role !== 'viewer';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const changeStatus = async (s: LeadStatus) => {
    if (s === lead.status || busy) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('leads').update({ status: s }).eq('id', lead.id).select('id');
    setBusy(false);
    if (error) setError(friendly(error));
    else if (!data?.length) setError(t('You do not have permission to change this property.'));
    else onChanged();
  };

  const contacted = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('touch_lead_contact', { p_lead: lead.id });
    setBusy(false);
    if (error) setError(friendly(error)); else onChanged();
  };

  if (editing) {
    return <LeadForm orgId={office.id} lead={lead} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;
  }

  return (
    <Modal title={<span className="block truncate">{person?.full_name ?? '…'}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        {canWrite && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${leadStatusCls[lead.status]}`}>{leadStatusLabel(lead.status)}</span>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">{purposeLabel(lead.purpose)}</span>
            {lead.source && <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">{t('Via {source}', { source: sourceLabel(lead.source) })}</span>}
          </div>
          {person && <div className="mt-3"><ContactLinks c={person} /></div>}
        </div>

        <div>
          <p className="font-display tabular text-xl font-bold">{budgetText(lead)}</p>
          <p className="mt-1 text-sm text-muted">{criteriaText(lead)}</p>
          {lead.notes && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{lead.notes}</p>}
        </div>

        <div className="rounded-2xl bg-surface-2 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ContactAge iso={lead.last_contact_at} stale={lead.status === 'new' || lead.status === 'active' || lead.status === 'viewing'} />
            {canWrite && <Btn tone="ghost" onClick={contacted} disabled={busy}><PhoneCall className="h-4 w-4" /> {t('Contacted today')}</Btn>}
          </div>
        </div>

        {canWrite && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Status')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map(s => (
                <button key={s} type="button" disabled={busy} aria-pressed={lead.status === s} onClick={() => changeStatus(s)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${lead.status === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {leadStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

        <ViewingsSection office={office} lead={lead} onChanged={onChanged} />
        <TasksSection office={office} userId={userId} lead={lead} />

        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Matching properties')} <span className="tabular opacity-60">{matches.length}</span></h3>
          {matches.length === 0
            ? <p className="text-sm text-muted">{t('No available property fits this search yet.')}</p>
            : (
              <SendMatches office={office} person={person} matches={matches} />
            )}
        </div>
      </div>
    </Modal>
  );
}
