import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, MessageCircle, Plus, Undo2, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PersonRow, SplitKind, SplitRow } from '../lib/types';
import type { DealView } from '../lib/deals';
import { SPLIT_KINDS, splitKindLabel, splitStatusLabel } from '../lib/labels';
import { SHARE_LANGS, type ShareLang } from '../lib/publicSite';
import { ourShareCents, sharedPct, splitCents, splitError, splitMessage } from '../lib/splits';
import { dateText } from '../lib/leases';
import { Btn, Field, inputCls } from './ui';
import { ContactLinks, waLink } from './ContactLinks';

function SplitForm({ orgId, dealId, taken, remaining, onDone, onCancel }: {
  orgId: string; dealId: string; taken: string[]; remaining: number; onDone: () => void; onCancel: () => void;
}) {
  const [orgPeople, setOrgPeople] = useState<PersonRow[] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [agency, setAgency] = useState('');
  const [kind, setKind] = useState<SplitKind>('co_agent');
  const [pct, setPct] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('people').select('id, full_name, phone, whatsapp, email').eq('org_id', orgId).order('full_name').then(({ data, error }) => {
      if (error) { setError(error.message); setOrgPeople([]); return; }
      const list = ((data ?? []) as PersonRow[]).filter(p => !taken.includes(p.id));
      setOrgPeople(list);
      if (list.length > 0) { setMode('existing'); setPersonId(list[0].id); }
    });
    // Filled in once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const share = Number(pct);
    if (!Number.isFinite(share) || share <= 0 || share > 100) { setError(t('The share must be between 0 and 100%.')); return; }
    if (share > remaining + 1e-9) { setError(t('The shares add up to more than 100%.')); return; }
    setBusy(true); setError(null);
    let id = personId;
    if (mode === 'new') {
      const { data, error } = await supabase.from('people').insert({
        org_id: orgId, full_name: name.trim(), phone: phone.trim() || null, whatsapp: whatsapp.trim() || null,
      }).select('id').single();
      if (error || !data) { setBusy(false); setError(error ? splitError(error.message) : t('Something went wrong.')); return; }
      id = data.id as string;
    }
    if (!id) { setBusy(false); setError(t('Choose a person.')); return; }
    const { error } = await supabase.from('deal_splits').insert({
      org_id: orgId, deal_id: dealId, person_id: id, kind, share_pct: share,
      agency_name: agency.trim() || null, agreement_note: note.trim() || null,
    });
    setBusy(false);
    if (error) setError(splitError(error.message)); else onDone();
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
              <>
                <Field label={t('Full name')}><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={200} required autoFocus /></Field>
                <Field label={t('Phone')}><input className={inputCls} dir="ltr" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
                <Field label={t('WhatsApp')}><input className={inputCls} dir="ltr" inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></Field>
              </>
            )}
            <Field label={t('Agency')} hint={t('Optional')}><input className={inputCls} value={agency} onChange={e => setAgency(e.target.value)} maxLength={200} /></Field>
            <Field label={t('Role')}>
              <select className={inputCls} value={kind} onChange={e => setKind(e.target.value as SplitKind)}>
                {SPLIT_KINDS.map(k => <option key={k} value={k}>{splitKindLabel(k)}</option>)}
              </select>
            </Field>
            <Field label={t('Share of the commission (%)')} hint={t('At most {n}% is left.', { n: String(Math.round(remaining * 100) / 100) })}>
              <input className={inputCls} dir="ltr" inputMode="decimal" type="number" min="0.01" max={remaining} step="0.01" value={pct} onChange={e => setPct(e.target.value)} required />
            </Field>
          </div>
          <Field label={t('How was this agreed?')} hint={t('For example: signed paper in the file, or WhatsApp of 12 October.')}>
            <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn type="button" onClick={onCancel}>{t('Cancel')}</Btn>
            <Btn tone="brand" type="submit" disabled={busy}>{busy ? '…' : t('Save share')}</Btn>
          </div>
        </>
      )}
    </form>
  );
}

/** Share the commission of a deal with another agent or a referrer, and follow what has been paid. */
export function DealSplits({ office, item, onChanged }: { office: Office; item: DealView; onChanged: () => void }) {
  const { d, property } = item;
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<SplitRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, PersonRow>>({});
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<ShareLang>('fr');

  const load = useCallback(async () => {
    const r = await supabase.from('deal_splits').select('*').eq('deal_id', d.id).order('created_at');
    if (r.error) { setError(r.error.message); setRows([]); return; }
    const list = (r.data ?? []) as SplitRow[];
    const map: Record<string, PersonRow> = {};
    const ids = Array.from(new Set(list.map(x => x.person_id)));
    if (ids.length > 0) {
      const p = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', ids);
      for (const x of (p.data ?? []) as PersonRow[]) map[x.id] = x;
    }
    setError(null); setPeople(map); setRows(list);
  }, [d.id]);
  useEffect(() => { load(); }, [load]);

  const patch = async (s: SplitRow, fields: Record<string, unknown>) => {
    if (busy) return;
    setBusy(s.id); setError(null);
    const { data, error } = await supabase.from('deal_splits').update(fields).eq('id', s.id).select('id');
    setBusy(null);
    if (error) { setError(splitError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return; }
    await load(); onChanged();
  };

  const remove = async (s: SplitRow) => {
    if (busy || !window.confirm(t('Remove the share of {name}?', { name: people[s.person_id]?.full_name ?? '' }))) return;
    setBusy(s.id); setError(null);
    const { data, error } = await supabase.from('deal_splits').delete().eq('id', s.id).select('id');
    setBusy(null);
    if (error) { setError(splitError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this.')); return; }
    await load(); onChanged();
  };

  const confirmByWhatsApp = (s: SplitRow) => {
    const p = people[s.person_id];
    const text = splitMessage({
      lang, name: (p?.full_name ?? '').trim().split(/\s+/)[0] || '', property: property?.title ?? '',
      pct: Number(s.share_pct), cents: splitCents(s, d.commission_cents), office: office.name,
    });
    const number = p?.whatsapp || p?.phone || null;
    window.open(number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const list = rows ?? [];
  const used = sharedPct(list);
  const remaining = Math.max(0, 100 - used);
  const ours = ourShareCents(d, list);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('Commission split')}</h3>
        <div className="flex items-center gap-1" role="group" aria-label={t('Language of the message')}>
          {SHARE_LANGS.map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      {rows === null && !error && <p className="text-sm text-muted">…</p>}
      {rows !== null && d.commission_cents === null && (
        <p className="mb-2 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Fill in the commission amount of the deal (Edit) so the amounts of the shares can be calculated.')}</p>
      )}
      {rows !== null && list.length === 0 && !adding && (
        <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-muted">{t('Not shared. If you work on this deal together with another agent, or owe someone for a tip, add their share of your commission here.')}</p>
      )}

      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map(s => {
            const p = people[s.person_id];
            const cents = splitCents(s, d.commission_cents);
            const paid = s.status === 'paid';
            return (
              <li key={s.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p?.full_name ?? '…'}{s.agency_name ? <span className="font-normal text-muted"> · {s.agency_name}</span> : null}</p>
                    <p className="mt-0.5 text-xs text-muted">{splitKindLabel(s.kind)}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="tabular text-sm font-bold">{Number(s.share_pct)}%{cents !== null && <> · {formatMad(cents)}</>}</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${paid ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                      {splitStatusLabel(s.status)}{paid && s.paid_on ? ` · ${dateText(s.paid_on)}` : ''}
                    </span>
                  </div>
                </div>
                {p && <div className="mt-2"><ContactLinks c={p} /></div>}
                {s.agreement_note && <p className="mt-2 whitespace-pre-line text-sm text-muted">{s.agreement_note}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {canWrite && (
                    <Btn tone="ghost" className="!px-3 !py-1.5" type="button" onClick={() => confirmByWhatsApp(s)}><MessageCircle className="h-4 w-4" /> {t('Confirm in writing')}</Btn>
                  )}
                  {canWrite && !paid && (
                    <Btn tone="ghost" className="!px-3 !py-1.5" type="button" disabled={busy === s.id} onClick={() => patch(s, { status: 'paid' })}><Check className="h-4 w-4" /> {t('Mark as paid')}</Btn>
                  )}
                  {canWrite && paid && (
                    <Btn tone="ghost" className="!px-3 !py-1.5" type="button" disabled={busy === s.id} onClick={() => patch(s, { status: 'agreed' })}><Undo2 className="h-4 w-4" /> {t('Undo')}</Btn>
                  )}
                  {canWrite && !paid && (
                    <Btn tone="ghost" className="!px-3 !py-1.5" type="button" disabled={busy === s.id} onClick={() => remove(s)}><X className="h-4 w-4" /> {t('Remove')}</Btn>
                  )}
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between gap-3 rounded-2xl bg-brand/10 px-3.5 py-3 text-sm font-semibold">
            <span>{t('Your office keeps')} <span className="tabular">{Math.round(remaining * 100) / 100}%</span></span>
            <span className="tabular font-bold">{ours === null ? '—' : formatMad(ours)}</span>
          </li>
        </ul>
      )}

      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {canWrite && !adding && rows !== null && remaining > 0 && (
        <Btn tone="ghost" className="mt-2 !px-3 !py-1.5" type="button" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add a share')}</Btn>
      )}
      {adding && (
        <SplitForm orgId={office.id} dealId={d.id} taken={list.map(s => s.person_id)} remaining={remaining}
          onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />
      )}
    </div>
  );
}
