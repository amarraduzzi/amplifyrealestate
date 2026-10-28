import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, MemberRow, TaskRow } from '../lib/types';
import { TASK_STATUSES, taskStatusLabel } from '../lib/labels';
import { loadMembers } from '../lib/tasks';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

type Opt = { id: string; label: string };

/** Add a task, or change one. leadId / propertyId link a new task to the lead or property it is opened from. */
export function TaskForm({ orgId, userId, task, leadId, propertyId, defaultDue, onClose, onSaved }: {
  orgId: string; userId: string; task?: TaskRow; leadId?: string; propertyId?: string; defaultDue?: string; onClose: () => void; onSaved: () => void;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [leads, setLeads] = useState<Opt[]>([]);
  const [props, setProps] = useState<Opt[]>([]);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.due_date ?? defaultDue ?? '');
  const [assignee, setAssignee] = useState(task ? (task.assigned_to ?? '') : userId);
  const [lead, setLead] = useState(task?.lead_id ?? leadId ?? '');
  const [property, setProperty] = useState(task?.property_id ?? propertyId ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [status, setStatus] = useState(task?.status ?? 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, l, p, pr] = await Promise.all([
          loadMembers(orgId),
          supabase.from('leads').select('id, person_id, status').eq('org_id', orgId),
          supabase.from('people').select('id, full_name').eq('org_id', orgId),
          supabase.from('properties').select('id, title, reference, status').eq('org_id', orgId).order('created_at', { ascending: false }),
        ]);
        if (cancelled) return;
        const err = l.error ?? p.error ?? pr.error;
        if (err) throw new Error(err.message);
        const names = new Map(((p.data ?? []) as { id: string; full_name: string }[]).map(x => [x.id, x.full_name]));
        setMembers(m);
        setLeads(((l.data ?? []) as Pick<LeadRow, 'id' | 'person_id' | 'status'>[])
          .filter(x => (x.status !== 'won' && x.status !== 'lost') || x.id === (task?.lead_id ?? leadId))
          .map(x => ({ id: x.id, label: names.get(x.person_id) ?? '…' }))
          .sort((a, b) => a.label.localeCompare(b.label)));
        setProps(((pr.data ?? []) as { id: string; title: string; reference: string; status: string }[])
          .filter(x => x.status !== 'withdrawn' || x.id === (task?.property_id ?? propertyId))
          .map(x => ({ id: x.id, label: `${x.title} · ${x.reference}` })));
        setReady(true);
      } catch (e) { if (!cancelled) { setError(friendly(e)); setReady(true); } }
    })();
    return () => { cancelled = true; };
  }, [orgId, task?.lead_id, task?.property_id, leadId, propertyId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError(t('Give the task a title.')); return; }
    const fields = {
      title: title.trim(), notes: notes.trim() || null, due_date: due || null,
      assigned_to: assignee || null, lead_id: lead || null, property_id: property || null,
    };
    setBusy(true); setError(null);
    if (task) {
      const { data, error } = await supabase.from('tasks').update({ ...fields, status }).eq('id', task.id).select('id');
      setBusy(false);
      if (error) setError(friendly(error));
      else if (!data?.length) setError(t('You do not have permission to change this.'));
      else onSaved();
      return;
    }
    const { error } = await supabase.from('tasks').insert({ org_id: orgId, ...fields });
    setBusy(false);
    if (error) setError(friendly(error)); else onSaved();
  };

  return (
    <Modal title={task ? t('Edit task') : t('Add a task')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="task-form" disabled={busy || !ready}>{busy ? '…' : task ? t('Save changes') : t('Save task')}</Btn></div>}>
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <Field label={t('Task')}>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('For example: call the owner')} maxLength={200} autoFocus required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Deadline')}>
            <input className={inputCls} type="date" value={due} onChange={e => setDue(e.target.value)} />
          </Field>
          <Field label={t('Assigned to')}>
            <select className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">{t('Nobody')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}{m.user_id === userId ? ` (${t('You')})` : ''}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('About lead')}>
            <select className={inputCls} value={lead} onChange={e => setLead(e.target.value)} disabled={!!leadId}>
              <option value="">{t('None')}</option>
              {leads.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
          <Field label={t('About property')}>
            <select className={inputCls} value={property} onChange={e => setProperty(e.target.value)} disabled={!!propertyId}>
              <option value="">{t('None')}</option>
              {props.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('Notes')}>
          <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {task && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('Status')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.map(s => (
                <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${status === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {taskStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
