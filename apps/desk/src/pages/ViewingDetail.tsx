import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ViewingOutcome, ViewingStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { ViewingView } from '../lib/viewings';
import { VIEWING_OUTCOMES, VIEWING_STATUSES, outcomeCls, outcomeLabel, viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { whenText } from '../lib/dates';
import { Btn, Modal } from '../components/ui';
import { ContactLinks } from '../components/ContactLinks';
import { ViewingForm } from './ViewingForm';
import { DealForm } from './DealForm';
import { SHARE_LANGS, whatsappShareUrl, type ShareLang } from '../lib/publicSite';
import { viewingReminder } from '../lib/leadMessage';
import { waLink } from '../components/ContactLinks';
import { MessageCircle } from 'lucide-react';

/** One viewing: when, who, which property, and how it went. */
export function ViewingDetail({ office, item, onChanged, onClose }: {
  office: Office; item: ViewingView; onChanged: () => void; onClose: () => void;
}) {
  const { v, person, property } = item;
  const canWrite = office.role !== 'viewer';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [lang, setLang] = useState<ShareLang>('fr');

  const changeStatus = async (s: ViewingStatus) => {
    if (s === v.status || busy) return;
    setBusy(true); setError(null);
    // An outcome only exists for a viewing that took place.
    const patch = s === 'done' ? { status: s } : { status: s, outcome: null };
    const { data, error } = await supabase.from('viewings').update(patch).eq('id', v.id).select('id');
    if (error) { setBusy(false); setError(error.message); return; }
    if (!data?.length) { setBusy(false); setError(t('You do not have permission to change this.')); return; }
    // A viewing that took place is also a moment of contact with the lead.
    if (s === 'done') await supabase.rpc('touch_lead_contact', { p_lead: v.lead_id });
    setBusy(false);
    onChanged();
  };

  const changeOutcome = async (o: ViewingOutcome) => {
    if (busy) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('viewings').update({ outcome: v.outcome === o ? null : o }).eq('id', v.id).select('id');
    setBusy(false);
    if (error) setError(error.message);
    else if (!data?.length) setError(t('You do not have permission to change this.'));
    else onChanged();
  };

  if (editing) {
    return <ViewingForm orgId={office.id} viewing={v} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;
  }

  if (dealing) {
    return <DealForm orgId={office.id} leadId={v.lead_id} propertyId={v.property_id} onClose={() => setDealing(false)} onSaved={() => { setDealing(false); onChanged(); onClose(); }} />;
  }

  const remind = () => {
    const text = viewingReminder({ lang, name: (person?.full_name ?? '').trim().split(/\s+/)[0] || '', whenIso: v.scheduled_at, propertyTitle: property?.title ?? '', office });
    const number = person?.whatsapp || person?.phone || null;
    window.open(number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : whatsappShareUrl(text), '_blank', 'noopener');
  };

  const overdue = v.status === 'scheduled' && new Date(v.scheduled_at).getTime() < Date.now();

  return (
    <Modal title={<span className="block truncate">{person?.full_name ?? '…'}</span>} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        {canWrite && <Btn onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
        <Btn tone="brand" onClick={onClose}>{t('Close')}</Btn>
      </div>}>
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${viewingStatusCls[v.status]}`}>{viewingStatusLabel(v.status)}</span>
            {v.outcome && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${outcomeCls[v.outcome]}`}>{outcomeLabel(v.outcome)}</span>}
          </div>
          <p className="font-display tabular mt-3 text-2xl font-bold">{whenText(v.scheduled_at)}</p>
          <p className="mt-1 text-sm text-muted">
            {property ? <>{property.title} <span className="tabular">· {property.reference}</span></> : '…'}
          </p>
          {person && <div className="mt-3"><ContactLinks c={person} /></div>}
          {v.notes && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{v.notes}</p>}
        </div>

        {overdue && canWrite && (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('The time has passed. Mark how it went.')}</p>
        )}

        {canWrite && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Status')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {VIEWING_STATUSES.map(s => (
                <button key={s} type="button" disabled={busy} aria-pressed={v.status === s} onClick={() => changeStatus(s)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${v.status === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {viewingStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {canWrite && v.status === 'done' && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('How did it go?')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {VIEWING_OUTCOMES.map(o => (
                <button key={o} type="button" disabled={busy} aria-pressed={v.outcome === o} onClick={() => changeOutcome(o)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${v.outcome === o ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {outcomeLabel(o)}
                </button>
              ))}
            </div>
          </div>
        )}

        {v.status === 'scheduled' && new Date(v.scheduled_at).getTime() > Date.now() && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Remind the client')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t('Language of the message')} className="rounded-xl border border-line/[0.12] bg-surface px-3 py-2 text-sm font-semibold" value={lang} onChange={e => setLang(e.target.value as ShareLang)}>
                {SHARE_LANGS.map(l => <option key={l} value={l}>{l === 'fr' ? 'Français' : l === 'ar' ? 'العربية' : 'English'}</option>)}
              </select>
              <Btn onClick={remind}><MessageCircle className="h-4 w-4 text-ok" /> {t('Send reminder on WhatsApp')}</Btn>
            </div>
          </div>
        )}

        {canWrite && v.status === 'done' && v.outcome === 'offer_made' && (
          <Btn tone="brand" onClick={() => setDealing(true)}>{t('Start a deal')}</Btn>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
