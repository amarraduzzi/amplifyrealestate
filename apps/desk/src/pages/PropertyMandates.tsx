import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import type { MandateBasis, MandateStatus } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { BASES, basisLabel, mandateCls, mandateStatusLabel } from '../lib/labels';
import { Btn, Field, inputCls } from '../components/ui';

type Mandate = {
  id: string; owner_person_id: string | null; basis: MandateBasis; status: MandateStatus;
  valid_from: string | null; valid_until: string | null; evidence_note: string | null; created_at: string;
};
type Person = { id: string; full_name: string };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
// Dates without a time (YYYY-MM-DD): shown as written, never shifted by the time zone.
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(d));
const today = () => new Date().toISOString().slice(0, 10);

/** A mandate that is still marked active but past its end date counts as expired. */
const effective = (m: Mandate): MandateStatus =>
  m.status === 'active' && m.valid_until && m.valid_until < today() ? 'expired' : m.status;

function MandateForm({ orgId, propertyId, onDone, onCancel }: { orgId: string; propertyId: string; onDone: () => void; onCancel: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [basis, setBasis] = useState<MandateBasis>('written');
  const [owner, setOwner] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('people').select('id, full_name').eq('org_id', orgId).order('full_name')
      .then(({ data }) => setPeople((data ?? []) as Person[]));
  }, [orgId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (from && until && until < from) { setError(t('The end date cannot be before the start date.')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from('property_mandates').insert({
      org_id: orgId, property_id: propertyId, basis, status: 'active',
      owner_person_id: owner || null, valid_from: from || null, valid_until: until || null,
      evidence_note: note.trim() || null,
    });
    setBusy(false);
    if (error) setError(error.message); else onDone();
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('Basis')}>
          <select className={inputCls} value={basis} onChange={e => setBasis(e.target.value as MandateBasis)}>
            {BASES.map(b => <option key={b} value={b}>{basisLabel(b)}</option>)}
          </select>
        </Field>
        <Field label={t('Given by')}>
          <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">{t('Not specified')}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label={t('Valid from')}><input className={inputCls} dir="ltr" type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label={t('Valid until')}><input className={inputCls} dir="ltr" type="date" value={until} onChange={e => setUntil(e.target.value)} /></Field>
      </div>
      <Field label={t('Evidence note')} hint={t('For example: signed contract in the office file, or WhatsApp message of 12 October.')}>
        <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </Field>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Btn type="button" onClick={onCancel}>{t('Cancel')}</Btn>
        <Btn tone="brand" type="submit" disabled={busy}>{busy ? '…' : t('Save mandate')}</Btn>
      </div>
    </form>
  );
}

export function PropertyMandates({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [rows, setRows] = useState<Mandate[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('property_mandates')
      .select('id, owner_person_id, basis, status, valid_from, valid_until, evidence_note, created_at')
      .eq('property_id', property.id).order('created_at', { ascending: false });
    if (error) { setError(error.message); return; }
    const list = (data ?? []) as Mandate[];
    const ids = Array.from(new Set(list.map(m => m.owner_person_id).filter((x): x is string => !!x)));
    const map: Record<string, string> = {};
    if (ids.length > 0) {
      const r = await supabase.from('people').select('id, full_name').in('id', ids);
      for (const p of (r.data ?? []) as Person[]) map[p.id] = p.full_name;
    }
    setError(null); setNames(map); setRows(list);
  }, [property.id]);
  useEffect(() => { load(); }, [load]);

  const revoke = async (m: Mandate) => {
    if (!window.confirm(t('Revoke this mandate? You can add a new one afterwards.'))) return;
    const { data, error } = await supabase.from('property_mandates').update({ status: 'revoked' }).eq('id', m.id).select('id');
    if (error) setError(error.message);
    else if (!data?.length) setError(t('You do not have permission to change this property.'));
    else load();
  };

  const hasActive = (rows ?? []).some(m => effective(m) === 'active');

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('Mandate')}</h3>
        {canWrite && !adding && <Btn tone="ghost" className="!px-3 !py-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add mandate')}</Btn>}
      </div>
      {error && <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="text-sm text-muted">…</p>}
      {rows !== null && !hasActive && (
        <p className="mb-2 flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('No active mandate. Record on what basis your office may offer this property.')}
        </p>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(m => {
            const st = effective(m);
            return (
              <li key={m.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${mandateCls[st]}`}>{mandateStatusLabel(st)}</span>
                  <span className={`text-sm font-semibold ${m.basis === 'unverified' ? 'text-warn' : ''}`}>{basisLabel(m.basis)}</span>
                  {canWrite && st === 'active' && <button type="button" onClick={() => revoke(m)} className="ms-auto text-xs font-semibold text-muted underline-offset-2 hover:text-danger hover:underline">{t('Revoke')}</button>}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  {[
                    m.owner_person_id && names[m.owner_person_id] ? t('Given by {name}', { name: names[m.owner_person_id] }) : null,
                    m.valid_from || m.valid_until
                      ? [m.valid_from ? t('from {date}', { date: day(m.valid_from) }) : null, m.valid_until ? t('until {date}', { date: day(m.valid_until) }) : null].filter(Boolean).join(' ')
                      : t('No end date'),
                  ].filter(Boolean).join(' · ')}
                </p>
                {m.evidence_note && <p className="mt-1.5 whitespace-pre-line text-sm">{m.evidence_note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <MandateForm orgId={office.id} propertyId={property.id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}
