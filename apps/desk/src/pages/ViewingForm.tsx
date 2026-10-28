import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, ViewingRow } from '../lib/types';
import { OPEN_LEAD_STATUSES, purposeLabel } from '../lib/labels';
import { defaultViewingTime, fromInputValue, toInputValue } from '../lib/dates';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

type LeadOpt = { lead: LeadRow; name: string };
type PropOpt = { id: string; title: string; reference: string };

/**
 * Schedule a viewing (a lead looks at a property), or change the time and notes of an existing one.
 * leadId / propertyId lock one side when the form is opened from a lead or from a property.
 */
export function ViewingForm({ orgId, viewing, leadId, propertyId, onClose, onSaved }: {
  orgId: string; viewing?: ViewingRow; leadId?: string; propertyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!viewing;
  const [leads, setLeads] = useState<LeadOpt[] | null>(editing ? [] : null);
  const [props, setProps] = useState<PropOpt[]>([]);
  const [lead, setLead] = useState(leadId ?? '');
  const [property, setProperty] = useState(propertyId ?? '');
  const [when, setWhen] = useState(viewing ? toInputValue(new Date(viewing.scheduled_at)) : defaultViewingTime());
  const [notes, setNotes] = useState(viewing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      const [l, p, pr] = await Promise.all([
        supabase.from('leads').select('*').eq('org_id', orgId),
        supabase.from('people').select('id, full_name').eq('org_id', orgId),
        supabase.from('properties').select('id, title, reference, status').eq('org_id', orgId).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      const err = l.error ?? p.error ?? pr.error;
      if (err) { setError(friendly(err)); setLeads([]); return; }
      const names = new Map(((p.data ?? []) as { id: string; full_name: string }[]).map(x => [x.id, x.full_name]));
      const lopts = ((l.data ?? []) as LeadRow[])
        .filter(x => OPEN_LEAD_STATUSES.includes(x.status) || x.id === leadId)
        .map(x => ({ lead: x, name: names.get(x.person_id) ?? '…' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const popts = ((pr.data ?? []) as (PropOpt & { status: string })[])
        .filter(x => x.status === 'available' || x.status === 'reserved' || x.id === propertyId);
      setLeads(lopts);
      setProps(popts);
      setLead(cur => cur || lopts[0]?.lead.id || '');
      setProperty(cur => cur || popts[0]?.id || '');
    })();
    return () => { cancelled = true; };
  }, [orgId, editing, leadId, propertyId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const iso = fromInputValue(when);
    if (!iso) { setError(t('Choose a date and time.')); return; }
    setBusy(true); setError(null);

    if (viewing) {
      const { data, error } = await supabase.from('viewings').update({ scheduled_at: iso, notes: notes.trim() || null }).eq('id', viewing.id).select('id');
      setBusy(false);
      if (error) setError(friendly(error));
      else if (!data?.length) setError(t('You do not have permission to change this.'));
      else onSaved();
      return;
    }

    if (!lead || !property) { setBusy(false); setError(t('Choose a lead and a property.')); return; }
    const { error } = await supabase.from('viewings').insert({ org_id: orgId, lead_id: lead, property_id: property, scheduled_at: iso, notes: notes.trim() || null });
    if (error) { setBusy(false); setError(friendly(error)); return; }
    // A lead that gets a viewing is now in the viewing phase. Not worth failing the save over.
    const chosen = leads?.find(x => x.lead.id === lead)?.lead;
    if (chosen && (chosen.status === 'new' || chosen.status === 'active')) {
      await supabase.from('leads').update({ status: 'viewing' }).eq('id', lead);
    }
    setBusy(false);
    onSaved();
  };

  const noOptions = !editing && leads !== null && (leads.length === 0 || props.length === 0);

  return (
    <Modal title={editing ? t('Edit viewing') : t('Schedule a viewing')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="viewing-form" disabled={busy || leads === null || noOptions}>{busy ? '…' : editing ? t('Save changes') : t('Schedule')}</Btn></div>}>
      <form id="viewing-form" onSubmit={submit} className="space-y-4">
        {!editing && leads !== null && (
          <>
            <Field label={t('Lead')}>
              <select className={inputCls} value={lead} onChange={e => setLead(e.target.value)} disabled={!!leadId} required>
                {leads.map(x => <option key={x.lead.id} value={x.lead.id}>{x.name} · {purposeLabel(x.lead.purpose)}</option>)}
              </select>
            </Field>
            <Field label={t('Property')}>
              <select className={inputCls} value={property} onChange={e => setProperty(e.target.value)} disabled={!!propertyId} required>
                {props.map(x => <option key={x.id} value={x.id}>{x.title} · {x.reference}</option>)}
              </select>
            </Field>
            {noOptions && (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
                {leads.length === 0 ? t('Add a lead first: a viewing is an appointment between a lead and a property.') : t('There is no available or reserved property to show yet.')}
              </p>
            )}
          </>
        )}
        <Field label={t('Date and time')}>
          <input className={inputCls} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} required />
        </Field>
        <Field label={t('Notes')} hint={t('For example where to meet, or who has the key.')}>
          <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
