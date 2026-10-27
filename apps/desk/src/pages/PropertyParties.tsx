import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Mail, MessageCircle, Phone, Plus, X } from 'lucide-react';
import type { PartyRole } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { PARTY_ROLES, partyRoleLabel } from '../lib/labels';
import { Btn, Field, inputCls } from '../components/ui';

type Person = { id: string; full_name: string; phone: string | null; whatsapp: string | null; email: string | null };
type Party = { person_id: string; role: PartyRole };

/** Moroccan numbers are often written 06 12 34 56 78: make that a working WhatsApp link. */
const waLink = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '212' + d.slice(1);
  return `https://wa.me/${d}`;
};

function PartyForm({ orgId, propertyId, onDone, onCancel }: { orgId: string; propertyId: string; onDone: () => void; onCancel: () => void }) {
  const [orgPeople, setOrgPeople] = useState<Person[] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<PartyRole>('owner');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('people').select('id, full_name, phone, whatsapp, email').eq('org_id', orgId).order('full_name').then(({ data, error }) => {
      if (error) { setError(error.message); setOrgPeople([]); return; }
      const list = (data ?? []) as Person[];
      setOrgPeople(list);
      if (list.length > 0) { setMode('existing'); setPersonId(list[0].id); }
    });
  }, [orgId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    let id = personId;
    if (mode === 'new') {
      const { data, error } = await supabase.from('people').insert({
        org_id: orgId, full_name: name.trim(),
        phone: phone.trim() || null, whatsapp: whatsapp.trim() || null, email: email.trim() || null,
      }).select('id').single();
      if (error || !data) { setBusy(false); setError(error?.message ?? t('Something went wrong.')); return; }
      id = data.id as string;
    }
    if (!id) { setBusy(false); setError(t('Choose a person.')); return; }
    const { error } = await supabase.from('property_parties').insert({ org_id: orgId, property_id: propertyId, person_id: id, role });
    setBusy(false);
    if (error) setError(error.code === '23505' ? t('This person already has that role on this property.') : error.message);
    else onDone();
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
      {orgPeople === null && <p className="text-sm text-muted">…</p>}
      {orgPeople !== null && (
        <>
          {orgPeople.length > 0 && (
            <div role="tablist" className="flex gap-1.5">
              {(['existing', 'new'] as const).map(m => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${mode === m ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {m === 'existing' ? t('Existing person') : t('New person')}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {mode === 'existing' ? (
              <Field label={t('Person')}>
                <select className={inputCls} value={personId} onChange={e => setPersonId(e.target.value)}>
                  {orgPeople.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label={t('Full name')}>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoFocus />
              </Field>
            )}
            <Field label={t('Role on this property')}>
              <select className={inputCls} value={role} onChange={e => setRole(e.target.value as PartyRole)}>
                {PARTY_ROLES.map(r => <option key={r} value={r}>{partyRoleLabel(r)}</option>)}
              </select>
            </Field>
            {mode === 'new' && (
              <>
                <Field label={t('Phone')}><input className={inputCls} dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
                <Field label={t('WhatsApp')}><input className={inputCls} dir="ltr" inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label={t('Email')}><input className={inputCls} dir="ltr" type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field></div>
              </>
            )}
          </div>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn type="button" onClick={onCancel}>{t('Cancel')}</Btn>
            <Btn tone="brand" type="submit" disabled={busy}>{busy ? '…' : t('Add person')}</Btn>
          </div>
        </>
      )}
    </form>
  );
}

export function PropertyParties({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [parties, setParties] = useState<Party[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('property_parties').select('person_id, role').eq('property_id', property.id).order('created_at');
    if (error) { setError(error.message); return; }
    const list = (data ?? []) as Party[];
    const ids = Array.from(new Set(list.map(p => p.person_id)));
    const map: Record<string, Person> = {};
    if (ids.length > 0) {
      const r = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', ids);
      if (r.error) { setError(r.error.message); return; }
      for (const p of (r.data ?? []) as Person[]) map[p.id] = p;
    }
    setError(null); setPeople(map); setParties(list);
  }, [property.id]);
  useEffect(() => { load(); }, [load]);

  const remove = async (p: Party) => {
    if (!window.confirm(t('Remove {name} from this property? The person stays in your contacts.', { name: people[p.person_id]?.full_name ?? '' }))) return;
    const { error } = await supabase.from('property_parties').delete()
      .eq('property_id', property.id).eq('person_id', p.person_id).eq('role', p.role);
    if (error) setError(error.message); else load();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('People')}</h3>
        {canWrite && !adding && <Btn tone="ghost" className="!px-3 !py-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add person')}</Btn>}
      </div>
      {error && <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {parties === null && !error && <p className="text-sm text-muted">…</p>}
      {parties !== null && parties.length === 0 && !adding && (
        <p className="text-sm text-muted">{t('No one linked yet. Add the owner so you know who to ask about price and availability.')}</p>
      )}
      {parties !== null && parties.length > 0 && (
        <ul className="space-y-2">
          {parties.map(p => {
            const person = people[p.person_id];
            if (!person) return null;
            return (
              <li key={`${p.person_id}-${p.role}`} className="flex items-start justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{person.full_name} <span className="ms-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-line/10">{partyRoleLabel(p.role)}</span></p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {person.phone && <a className="inline-flex items-center gap-1.5 text-muted hover:text-ink" href={`tel:${person.phone.replace(/\s/g, '')}`}><Phone className="h-3.5 w-3.5" /><span dir="ltr">{person.phone}</span></a>}
                    {person.whatsapp && <a className="inline-flex items-center gap-1.5 text-ok hover:underline" href={waLink(person.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /><span dir="ltr">{person.whatsapp}</span></a>}
                    {person.email && <a className="inline-flex items-center gap-1.5 text-muted hover:text-ink" href={`mailto:${person.email}`}><Mail className="h-3.5 w-3.5" /><span dir="ltr">{person.email}</span></a>}
                    {!person.phone && !person.whatsapp && !person.email && <span className="text-muted">{t('No contact details')}</span>}
                  </div>
                </div>
                {canWrite && <button type="button" onClick={() => remove(p)} aria-label={t('Remove')} title={t('Remove')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-muted ring-1 ring-line/10 hover:text-danger"><X className="h-4 w-4" /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <PartyForm orgId={office.id} propertyId={property.id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}
