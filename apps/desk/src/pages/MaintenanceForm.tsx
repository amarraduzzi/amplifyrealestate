import { useEffect, useState, type FormEvent } from 'react';
import { dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { COST_BY, MAINT_PRIORITIES, costByLabel, priorityLabel, type CostBy, type MaintPriority, type MaintRow } from '../lib/maintenance';
import { planError } from '../lib/plan';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

type PropOpt = { id: string; title: string; reference: string };
type Person = { id: string; full_name: string };
const NEW = '__new__';
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Report a problem at a property, or change the details of an existing report. */
export function MaintenanceForm({ orgId, item, propertyId, onClose, onSaved }: {
  orgId: string; item?: MaintRow; propertyId?: string; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!item;
  const [props, setProps] = useState<PropOpt[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [property, setProperty] = useState(item?.property_id ?? propertyId ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [desc, setDesc] = useState(item?.description ?? '');
  const [priority, setPriority] = useState<MaintPriority>(item?.priority ?? 'normal');
  const [reporter, setReporter] = useState(item?.reported_by_person_id ?? '');
  const [contractor, setContractor] = useState(item?.assigned_person_id ?? '');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [cost, setCost] = useState(item?.cost_cents == null ? '' : String(item.cost_cents / 100));
  const [by, setBy] = useState<CostBy | ''>(item?.cost_borne_by ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pr, pe] = await Promise.all([
        supabase.from('properties').select('id, title, reference, status').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('people').select('id, full_name').eq('org_id', orgId).order('full_name'),
      ]);
      if (cancelled) return;
      const err = pr.error ?? pe.error;
      if (err) { setError(friendly(err)); setProps([]); return; }
      const opts = ((pr.data ?? []) as (PropOpt & { status: string })[]).filter(x => x.status !== 'withdrawn' || x.id === (item?.property_id ?? propertyId));
      setProps(opts);
      setPeople((pe.data ?? []) as Person[]);
      setProperty(cur => cur || opts[0]?.id || '');
    })();
    return () => { cancelled = true; };
  }, [orgId, item?.property_id, propertyId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { setError(t('Describe the problem in a few words.')); return; }
    if (!property) { setError(t('Choose a property.')); return; }
    const c = num(cost);
    if (c !== null && (!Number.isFinite(c) || c < 0)) { setError(t('The cost cannot be negative.')); return; }
    setBusy(true); setError(null);

    let assigned: string | null = contractor || null;
    if (contractor === NEW) {
      if (!newName.trim()) { setBusy(false); setError(t('Enter the name of the repairer.')); return; }
      const ins = await supabase.from('people').insert({ org_id: orgId, full_name: newName.trim(), phone: newPhone.trim() || null }).select('id').single();
      if (ins.error || !ins.data) { setBusy(false); setError(planError(ins.error?.message ?? 'error')); return; }
      assigned = (ins.data as { id: string }).id;
    }
    const fields = {
      title: title.trim(), description: desc.trim() || null, priority,
      reported_by_person_id: reporter || null, assigned_person_id: assigned,
      cost_cents: c === null ? null : dirhamToCents(c), cost_borne_by: c === null && !by ? null : (by || null),
    };
    if (item) {
      const { data, error } = await supabase.from('maintenance_requests').update(fields).eq('id', item.id).select('id');
      setBusy(false);
      if (error) setError(planError(error.message));
      else if (!data?.length) setError(t('You do not have permission to change this.'));
      else onSaved();
      return;
    }
    const { error } = await supabase.from('maintenance_requests').insert({ org_id: orgId, property_id: property, ...fields });
    setBusy(false);
    if (error) { setError(planError(error.message)); return; }
    onSaved();
  };

  return (
    <Modal title={editing ? t('Edit request') : t('Report a problem')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="maint-form" disabled={busy || props === null}>{busy ? '…' : editing ? t('Save changes') : t('Add request')}</Btn></div>}>
      <form id="maint-form" onSubmit={submit} className="space-y-4">
        <Field label={t('Property')}>
          <select className={inputCls} value={property} onChange={e => setProperty(e.target.value)} disabled={editing || !!propertyId} required>
            {(props ?? []).map(x => <option key={x.id} value={x.id}>{x.title} · {x.reference}</option>)}
          </select>
        </Field>
        <Field label={t('What is the problem?')}>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('For example: water leak in the bathroom')} maxLength={200} required />
        </Field>
        <Field label={t('Details')}>
          <textarea className={inputCls} rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
        </Field>
        <Field label={t('How urgent is it?')}>
          <select className={inputCls} value={priority} onChange={e => setPriority(e.target.value as MaintPriority)}>
            {MAINT_PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
          </select>
        </Field>
        <Field label={t('Reported by')} hint={t('For example the tenant.')}>
          <select className={inputCls} value={reporter} onChange={e => setReporter(e.target.value)}>
            <option value="">{t('Nobody')}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label={t('Repairer')} hint={t('The person who fixes it, for example a plumber.')}>
          <select className={inputCls} value={contractor} onChange={e => setContractor(e.target.value)}>
            <option value="">{t('Nobody')}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            <option value={NEW}>{t('New person…')}</option>
          </select>
        </Field>
        {contractor === NEW && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Full name')}><input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} required /></Field>
            <Field label={t('Phone')}><input className={inputCls} dir="ltr" inputMode="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Cost (DH)')} hint={t('Leave empty while unknown.')}>
            <input className={inputCls} inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} />
          </Field>
          <Field label={t('Paid by')}>
            <select className={inputCls} value={by} onChange={e => setBy(e.target.value as CostBy | '')}>
              <option value="">—</option>
              {COST_BY.map(c => <option key={c} value={c}>{costByLabel(c)}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
