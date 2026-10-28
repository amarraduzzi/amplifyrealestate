import { useEffect, useState, type FormEvent } from 'react';
import { dirhamToCents, type DealPurpose, type PropertyType } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, PersonRow } from '../lib/types';
import { PURPOSES, SOURCES, TYPES, purposeLabel, sourceLabel, typeLabel } from '../lib/labels';
import { Btn, Field, Modal, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

const num = (s: string) => (s.trim() === '' ? null : Number(s));
const str = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));
const hoods = (s: string) => Array.from(new Set(s.split(/[,،;]/).map(x => x.trim()).filter(Boolean)));

/** Add a lead (a person plus what they are looking for), or edit the search of an existing lead. */
export function LeadForm({ orgId, lead, onClose, onSaved }: { orgId: string; lead?: LeadRow; onClose: () => void; onSaved: () => void }) {
  const editing = !!lead;
  const [orgPeople, setOrgPeople] = useState<PersonRow[] | null>(editing ? [] : null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  const [purpose, setPurpose] = useState<DealPurpose>(lead?.purpose ?? 'rent_long');
  const [types, setTypes] = useState<PropertyType[]>(lead?.property_types ?? []);
  const [city, setCity] = useState(lead?.city ?? '');
  const [hood, setHood] = useState((lead?.neighborhoods ?? []).join(', '));
  const [bmin, setBmin] = useState(lead?.budget_min_cents == null ? '' : str(lead.budget_min_cents / 100));
  const [bmax, setBmax] = useState(lead?.budget_max_cents == null ? '' : str(lead.budget_max_cents / 100));
  const [beds, setBeds] = useState(str(lead?.min_bedrooms));
  const [area, setArea] = useState(lead?.min_area_m2 == null ? '' : str(Number(lead.min_area_m2)));
  const [furnished, setFurnished] = useState(lead?.furnished == null ? '' : lead.furnished ? 'yes' : 'no');
  const [notes, setNotes] = useState(lead?.notes ?? '');
  const [source, setSource] = useState<string>(lead?.source ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    supabase.from('people').select('id, full_name, phone, whatsapp, email').eq('org_id', orgId).order('full_name').then(({ data, error }) => {
      if (error) { setError(friendly(error)); setOrgPeople([]); return; }
      const list = (data ?? []) as PersonRow[];
      setOrgPeople(list);
      if (list.length > 0) { setMode('existing'); setPersonId(list[0].id); }
    });
  }, [orgId, editing]);

  const toggleType = (x: PropertyType) => setTypes(cur => (cur.includes(x) ? cur.filter(y => y !== x) : [...cur, x]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const lo = num(bmin), hi = num(bmax), b = num(beds), a = num(area);
    if ([lo, hi, b, a].some(x => x !== null && (!Number.isFinite(x) || x < 0))) { setError(t('Please check the numbers: they cannot be negative.')); return; }
    if (lo !== null && hi !== null && hi < lo) { setError(t('The maximum budget cannot be lower than the minimum.')); return; }
    const fields = {
      purpose,
      property_types: types,
      city: city.trim() || null,
      neighborhoods: hoods(hood),
      budget_min_cents: lo === null ? null : dirhamToCents(lo),
      budget_max_cents: hi === null ? null : dirhamToCents(hi),
      min_bedrooms: b === null ? null : Math.round(b),
      min_area_m2: a === null || a === 0 ? null : a,
      furnished: furnished === '' ? null : furnished === 'yes',
      notes: notes.trim() || null,
      ...(source || lead?.source ? { source: source || null } : {}),
    };
    setBusy(true); setError(null);

    if (lead) {
      const { data, error } = await supabase.from('leads').update(fields).eq('id', lead.id).select('id');
      setBusy(false);
      if (error) setError(friendly(error));
      else if (!data?.length) setError(t('You do not have permission to change this property.'));
      else onSaved();
      return;
    }

    let id = personId;
    if (mode === 'new') {
      const { data, error } = await supabase.from('people').insert({
        org_id: orgId, full_name: name.trim(),
        phone: phone.trim() || null, whatsapp: whatsapp.trim() || null, email: email.trim() || null,
      }).select('id').single();
      if (error || !data) { setBusy(false); setError(friendly(error)); return; }
      id = data.id as string;
    }
    if (!id) { setBusy(false); setError(t('Choose a person.')); return; }
    const { error } = await supabase.from('leads').insert({ org_id: orgId, person_id: id, ...fields });
    setBusy(false);
    if (error) setError(friendly(error)); else onSaved();
  };

  const per = purpose === 'rent_long' ? t('Per month') : purpose === 'rent_short' ? t('Per night') : t('Total price');

  return (
    <Modal title={editing ? t('Edit lead') : t('Add a lead')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn type="button" onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="lead-form" disabled={busy || orgPeople === null}>{busy ? '…' : editing ? t('Save changes') : t('Save lead')}</Btn></div>}>
      <form id="lead-form" onSubmit={submit} className="space-y-4">
        {!editing && orgPeople !== null && (
          <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
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
            {mode === 'existing' ? (
              <Field label={t('Person')}>
                <select className={inputCls} value={personId} onChange={e => setPersonId(e.target.value)}>
                  {orgPeople.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label={t('Full name')}><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoFocus /></Field></div>
                <Field label={t('Phone')}><input className={inputCls} dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
                <Field label={t('WhatsApp')}><input className={inputCls} dir="ltr" inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label={t('Email')}><input className={inputCls} dir="ltr" type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field></div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Looking for')}>
            <select className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value as DealPurpose)}>
              {PURPOSES.map(x => <option key={x} value={x}>{purposeLabel(x)}</option>)}
            </select>
          </Field>
          <Field label={t('Source')} hint={t('Where did this lead come from?')}>
            <select className={inputCls} value={source} onChange={e => setSource(e.target.value)}>
              <option value="">{t('Not specified')}</option>
              {SOURCES.map(x => <option key={x} value={x}>{sourceLabel(x)}</option>)}
            </select>
          </Field>
          <Field label={t('Furnished')}>
            <select className={inputCls} value={furnished} onChange={e => setFurnished(e.target.value)}>
              <option value="">{t('Not specified')}</option>
              <option value="yes">{t('Furnished')}</option>
              <option value="no">{t('Unfurnished')}</option>
            </select>
          </Field>
          <Field label={t('Budget from (DH)')} hint={per}><input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0" step="any" value={bmin} onChange={e => setBmin(e.target.value)} /></Field>
          <Field label={t('Budget up to (DH)')} hint={per}><input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0" step="any" value={bmax} onChange={e => setBmax(e.target.value)} /></Field>
          <Field label={t('City')}><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder={t('Rabat')} /></Field>
          <Field label={t('Neighborhoods')} hint={t('Separate with commas. Empty means anywhere.')}><input className={inputCls} value={hood} onChange={e => setHood(e.target.value)} placeholder={t('Agdal, Hay Riad')} /></Field>
          <Field label={t('Minimum bedrooms')}><input className={inputCls} dir="ltr" inputMode="numeric" type="number" min="0" value={beds} onChange={e => setBeds(e.target.value)} /></Field>
          <Field label={t('Minimum area (m²)')}><input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)} /></Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">{t('Property types')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map(x => (
              <button key={x} type="button" aria-pressed={types.includes(x)} onClick={() => toggleType(x)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${types.includes(x) ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                {typeLabel(x)}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted">{t('Leave all off for any type.')}</span>
        </fieldset>

        <Field label={t('Notes')}><textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
