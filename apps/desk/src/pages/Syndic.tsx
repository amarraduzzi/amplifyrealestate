import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Building, ChevronDown, MessageCircle, Plus } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import {
  LOT_KINDS, loadArrears, loadResidence, loadResidences, previewSplit, syndicError,
  type Call, type Item, type Lot, type LotKind, type Owner, type Residence,
} from '../lib/syndic';
import { planError } from '../lib/plan';
import { waLink } from '../components/ContactLinks';
import { Btn, Card, Field, Modal, inputCls } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);
const kindLabel = (k: LotKind) => t(({ apartment: 'Apartment', shop: 'Shop', office: 'Office', parking: 'Parking', storage: 'Storage', other: 'Other' } as const)[k]);
const err = (m: string) => { const x = syndicError(m); return x ? t(x) : planError(m); };
const cents = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? dirhamToCents(v) : 0; };

/** One-tap WhatsApp reminder to a co-owner, in French or Arabic. */
function remind(owner: Owner | undefined, residence: string, amount: number, lang: 'fr' | 'ar', office: string) {
  const first = (owner?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
  const text = lang === 'ar'
    ? `مرحبا ${first}، تذكير بأن مبلغ ${formatMad(amount)} من مساهمات السانديك لإقامة ${residence} لم يؤد بعد. شكرا على التسوية في أقرب وقت.\n— ${office}`
    : `Bonjour ${first}, petit rappel : un montant de ${formatMad(amount)} de charges de copropriété de la résidence ${residence} reste à régler. Merci de procéder au paiement dès que possible.\n— ${office}`;
  const n = owner?.whatsapp || owner?.phone;
  window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function ResidenceForm({ office, residence, onClose, onSaved }: { office: Office; residence?: Residence; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: residence?.name ?? '', address: residence?.address ?? '', city: residence?.city ?? office.city ?? '', rib: residence?.rib ?? '', notes: residence?.notes ?? '' });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) { setError(t('Enter the name of the residence.')); return; }
    const row = { name: f.name.trim(), address: f.address.trim() || null, city: f.city.trim() || null, rib: f.rib.trim() || null, notes: f.notes.trim() || null };
    const r = residence ? await supabase.from('residences').update(row).eq('id', residence.id).select('id') : await supabase.from('residences').insert({ ...row, org_id: office.id }).select('id');
    if (r.error) { setError(err(r.error.message)); return; }
    onSaved((r.data?.[0] as { id: string }).id);
  };
  return (
    <Modal title={residence ? residence.name : t('New residence')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="res-form">{t('Save')}</Btn></div>}>
      <form id="res-form" onSubmit={save} className="space-y-3">
        <Field label={t('Name of the residence')}><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={200} placeholder="Résidence Al Andalous" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Address')}><input className={inputCls} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} maxLength={300} /></Field>
          <Field label={t('City')}><input className={inputCls} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} maxLength={100} /></Field>
        </div>
        <Field label={t('RIB of the syndic account')}><input className={inputCls} dir="ltr" value={f.rib} onChange={e => setF({ ...f, rib: e.target.value })} maxLength={60} /></Field>
        <Field label={t('Notes')}><textarea className={inputCls} rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={2000} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function LotForm({ office, residenceId, lot, owner, onClose, onSaved }: { office: Office; residenceId: string; lot?: Lot; owner?: Owner; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ label: lot?.label ?? '', kind: (lot?.kind ?? 'apartment') as LotKind, floor: lot?.floor ?? '', tantiemes: lot ? String(Number(lot.tantiemes)) : '', ownerName: owner?.full_name ?? '', phone: owner?.whatsapp || owner?.phone || '' });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.label.trim()) { setError(t('Enter the name of the lot, for example A12.')); return; }
    const tant = Number(f.tantiemes.replace(',', '.')) || 0;
    let ownerId = lot?.owner_person_id ?? null;
    const name = f.ownerName.trim();
    if (name && (!owner || owner.full_name !== name || (owner.whatsapp || owner.phone || '') !== f.phone.trim())) {
      if (owner && owner.full_name === name) {
        await supabase.from('people').update({ phone: f.phone.trim() || null, whatsapp: f.phone.trim() || null }).eq('id', owner.id);
      } else {
        const p = await supabase.from('people').insert({ org_id: office.id, full_name: name, phone: f.phone.trim() || null, whatsapp: f.phone.trim() || null, notes: 'Copropriétaire' }).select('id').single();
        if (p.error) { setError(err(p.error.message)); return; }
        ownerId = (p.data as { id: string }).id;
      }
    }
    if (!name) ownerId = null;
    const row = { label: f.label.trim(), kind: f.kind, floor: f.floor.trim() || null, tantiemes: tant, owner_person_id: ownerId };
    const r = lot ? await supabase.from('residence_lots').update(row).eq('id', lot.id).select('id') : await supabase.from('residence_lots').insert({ ...row, org_id: office.id, residence_id: residenceId }).select('id');
    if (r.error) { setError(err(r.error.message)); return; }
    onSaved();
  };
  return (
    <Modal title={lot ? lot.label : t('New lot')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="lot-form">{t('Save')}</Btn></div>}>
      <form id="lot-form" onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Lot')}><input className={inputCls} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} maxLength={60} placeholder="A12" /></Field>
          <Field label={t('Floor')}><input className={inputCls} value={f.floor} onChange={e => setF({ ...f, floor: e.target.value })} maxLength={20} /></Field>
          <Field label={t('Tantièmes')}><input className={inputCls} dir="ltr" inputMode="decimal" value={f.tantiemes} onChange={e => setF({ ...f, tantiemes: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LOT_KINDS.map(k => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.kind === k ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{kindLabel(k)}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Co-owner')}><input className={inputCls} value={f.ownerName} onChange={e => setF({ ...f, ownerName: e.target.value })} maxLength={200} /></Field>
          <Field label={t('Phone or WhatsApp')}><input className={inputCls} dir="ltr" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={40} /></Field>
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function CallForm({ residenceId, lots, onClose, onSaved }: { residenceId: string; lots: Lot[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', due: '', total: '', basis: 'tantiemes' as 'tantiemes' | 'equal' });
  const [error, setError] = useState<string | null>(null);
  const total = cents(f.total);
  const split = useMemo(() => previewSplit(lots, total, f.basis), [lots, total, f.basis]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2 || !f.due || total <= 0) { setError(t('Fill in a title, a due date and an amount.')); return; }
    const { error } = await supabase.rpc('issue_charge_call', { p_residence: residenceId, p_title: f.title.trim(), p_due: f.due, p_total_cents: total, p_basis: f.basis });
    if (error) { setError(err(error.message)); return; }
    onSaved();
  };
  return (
    <Modal title={t('New call for funds')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="call-form">{t('Issue')}</Btn></div>}>
      <form id="call-form" onSubmit={save} className="space-y-3">
        <Field label={t('Title')}><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={200} placeholder="Charges 1er trimestre 2027" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Total amount (DH)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={f.total} onChange={e => setF({ ...f, total: e.target.value })} /></Field>
          <Field label={t('Due date')}><input type="date" className={inputCls} value={f.due} onChange={e => setF({ ...f, due: e.target.value })} /></Field>
        </div>
        <div className="flex gap-1.5">
          {(['tantiemes', 'equal'] as const).map(b => <button key={b} type="button" aria-pressed={f.basis === b} onClick={() => setF({ ...f, basis: b })} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f.basis === b ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{b === 'tantiemes' ? t('By tantièmes') : t('Equal per lot')}</button>)}
        </div>
        {total > 0 && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-surface-2 p-2.5 text-sm">
            {lots.map(l => <li key={l.id} className="flex justify-between"><span>{l.label} <span className="text-xs text-muted">· {Number(l.tantiemes)}</span></span><span className="tabular">{formatMad(split.get(l.id) ?? 0)}</span></li>)}
          </ul>
        )}
        <p className="text-xs text-muted">{t('After issuing, the amounts per lot are fixed. You can cancel the call as long as nothing has been paid.')}</p>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function ResidenceView({ office, residence, onBack, onChanged }: { office: Office; residence: Residence; onBack: () => void; onChanged: () => void }) {
  const canWrite = office.role !== 'viewer';
  const [data, setData] = useState<{ lots: Lot[]; owners: Map<string, Owner>; calls: Call[]; items: Item[] } | null>(null);
  const [tab, setTab] = useState<'lots' | 'calls' | 'arrears'>('lots');
  const [lotForm, setLotForm] = useState<{ lot?: Lot } | null>(null);
  const [callForm, setCallForm] = useState(false);
  const [editRes, setEditRes] = useState(false);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => setData(await loadResidence(residence.id)), [residence.id]);
  useEffect(() => { load(); }, [load]);

  const today = todayIso();
  const lotMap = useMemo(() => new Map((data?.lots ?? []).map(l => [l.id, l])), [data]);
  const issued = (data?.calls ?? []).filter(c => c.status === 'issued');
  const arrears = useMemo(() => {
    const due = new Map<string, number>();
    const pastCalls = new Set(issued.filter(c => c.due_date < today).map(c => c.id));
    for (const i of data?.items ?? []) if (pastCalls.has(i.call_id)) due.set(i.lot_id, (due.get(i.lot_id) ?? 0) + i.amount_cents - i.paid_cents);
    return [...due.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [data, issued, today]);
  const totalTant = (data?.lots ?? []).reduce((s, l) => s + Number(l.tantiemes), 0);
  const totalArrears = arrears.reduce((s, [, v]) => s + v, 0);

  const pay = async (i: Item, full: boolean) => {
    let amount = i.amount_cents;
    if (!full) {
      const v = window.prompt(t('Amount paid (DH)'), String((i.amount_cents - i.paid_cents) / 100));
      if (v === null) return;
      amount = Math.min(i.amount_cents, i.paid_cents + cents(v));
    }
    const r = await supabase.from('charge_items').update({ paid_cents: amount, paid_on: null }).eq('id', i.id).select('id');
    if (r.error) setError(err(r.error.message)); else load();
  };
  const undo = async (i: Item) => { const r = await supabase.from('charge_items').update({ paid_cents: 0 }).eq('id', i.id).select('id'); if (r.error) setError(err(r.error.message)); else load(); };
  const cancelCall = async (c: Call) => {
    if (!window.confirm(t('Cancel this call for funds?'))) return;
    const { error } = await supabase.rpc('cancel_charge_call', { p_call: c.id });
    if (error) setError(err(error.message)); else load();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('All residences')}</button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{residence.name}</h1>
          <p className="text-sm text-muted">{[residence.address, residence.city].filter(Boolean).join(', ') || '—'}</p>
        </div>
        {canWrite && <Btn tone="ghost" onClick={() => setEditRes(true)}>{t('Edit')}</Btn>}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Card><p className="text-xs text-muted sm:text-sm">{t('Lots')}</p><p className="font-display tabular mt-1 text-xl font-bold">{data?.lots.length ?? '…'}</p></Card>
        <Card><p className="text-xs text-muted sm:text-sm">{t('Tantièmes')}</p><p className="font-display tabular mt-1 text-xl font-bold">{totalTant}</p></Card>
        <Card><p className="text-xs text-muted sm:text-sm">{t('Unpaid charges')}</p><p className={`font-display tabular mt-1 text-xl font-bold ${totalArrears ? 'text-danger' : ''}`}>{office.role === 'viewer' ? '—' : formatMad(totalArrears)}</p></Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5" role="tablist">
        {(['lots', 'calls', 'arrears'] as const).filter(x => x === 'lots' || office.role !== 'viewer').map(x => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
            {x === 'lots' ? t('Lots') : x === 'calls' ? t('Calls for funds') : t('Unpaid')}{x === 'arrears' && arrears.length ? ` ${arrears.length}` : ''}
          </button>
        ))}
        {tab !== 'lots' && (
          <span className="ms-auto flex gap-1">{(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{l}</button>)}</span>
        )}
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {!data && <p className="mt-8 text-center text-muted">…</p>}

      {data && tab === 'lots' && (
        <div className="mt-4">
          {canWrite && <Btn tone="brand" onClick={() => setLotForm({})}><Plus className="h-4 w-4" /> {t('Add a lot')}</Btn>}
          {data.lots.length === 0 ? <p className="mt-6 text-center text-sm text-muted">{t('No lots yet. Add every apartment, shop and parking with its tantièmes.')}</p> : (
            <ul className="mt-3 divide-y divide-line/[0.07] rounded-2xl bg-surface ring-1 ring-line/10">
              {data.lots.map(l => {
                const o = l.owner_person_id ? data.owners.get(l.owner_person_id) : undefined;
                return (
                  <li key={l.id}>
                    <button type="button" disabled={!canWrite} onClick={() => setLotForm({ lot: l })} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-2 disabled:hover:bg-transparent">
                      <span className="min-w-0"><span className="font-semibold">{l.label}</span> <span className="text-xs text-muted">· {kindLabel(l.kind)}{l.floor ? ` · ${t('floor {n}', { n: l.floor })}` : ''}</span>
                        <span className="block truncate text-xs text-muted">{o?.full_name ?? t('No co-owner yet')}</span></span>
                      <span className="tabular shrink-0 text-sm">{Number(l.tantiemes)} <span className="text-xs text-muted">{totalTant ? `(${(Number(l.tantiemes) / totalTant * 100).toFixed(1)}%)` : ''}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {data && tab === 'calls' && (
        <div className="mt-4 space-y-2">
          {canWrite && <Btn tone="brand" onClick={() => setCallForm(true)}><Plus className="h-4 w-4" /> {t('New call for funds')}</Btn>}
          {data.calls.length === 0 && <p className="mt-6 text-center text-sm text-muted">{t('No calls for funds yet.')}</p>}
          {data.calls.map(c => {
            const its = data.items.filter(i => i.call_id === c.id);
            const paid = its.reduce((s, i) => s + i.paid_cents, 0);
            const open = openCall === c.id;
            return (
              <section key={c.id} className={`card rounded-2xl ${c.status === 'cancelled' ? 'opacity-60' : ''}`}>
                <button type="button" onClick={() => setOpenCall(open ? null : c.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
                  <span className="min-w-0"><span className="block truncate font-semibold">{c.title}</span><span className="text-xs text-muted">{t('Due {date}', { date: day(c.due_date) })}{c.status === 'cancelled' ? ` · ${t('Cancelled')}` : ''}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-sm"><span className="tabular">{formatMad(paid)} / {formatMad(c.total_cents)}</span><ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></span>
                </button>
                {open && (
                  <div className="border-t border-line/[0.07] px-4 py-2">
                    <ul className="divide-y divide-line/[0.07] text-sm">
                      {its.sort((a, b) => (lotMap.get(a.lot_id)?.label ?? '').localeCompare(lotMap.get(b.lot_id)?.label ?? '')).map(i => {
                        const l = lotMap.get(i.lot_id); const o = l?.owner_person_id ? data.owners.get(l.owner_person_id) : undefined;
                        const left = i.amount_cents - i.paid_cents; const late = left > 0 && c.due_date < today;
                        return (
                          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span className="min-w-0"><span className="font-semibold">{l?.label}</span> <span className="text-xs text-muted">· {o?.full_name ?? '—'}</span></span>
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={`tabular ${late ? 'font-semibold text-danger' : ''}`}>{formatMad(i.amount_cents)}</span>
                              {left === 0 ? <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-bold text-ok">{t('Paid')}</span>
                                : i.paid_cents > 0 ? <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-bold text-warn">{t('{amount} left', { amount: formatMad(left) })}</span> : null}
                              {canWrite && c.status === 'issued' && left > 0 && (<>
                                <button type="button" onClick={() => pay(i, true)} className="inline-flex items-center gap-1 rounded-lg bg-ok px-2 py-1 text-xs font-semibold text-white">+ {t('Received')}</button>
                                <button type="button" onClick={() => pay(i, false)} className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold">{t('Part')}</button>
                                <button type="button" onClick={() => remind(o, residence.name, left, lang, office.name)} aria-label={t('Send reminder')} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ok"><MessageCircle className="h-4 w-4" /></button>
                              </>)}
                              {canWrite && i.paid_cents > 0 && <button type="button" onClick={() => undo(i)} className="text-xs text-muted hover:text-ink">{t('Undo')}</button>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {canWrite && c.status === 'issued' && paid === 0 && <button type="button" onClick={() => cancelCall(c)} className="my-2 text-xs font-semibold text-danger">{t('Cancel this call')}</button>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {data && tab === 'arrears' && (
        <div className="mt-4">
          {arrears.length === 0 ? <p className="mt-6 text-center text-sm text-muted">{t('Everyone is up to date.')}</p> : (
            <ul className="space-y-2">
              {arrears.map(([lotId, v]) => {
                const l = lotMap.get(lotId); const o = l?.owner_person_id ? data.owners.get(l.owner_person_id) : undefined;
                return (
                  <li key={lotId} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
                    <span className="min-w-0 text-sm"><span className="font-semibold">{l?.label}</span> <span className="text-muted">· {o?.full_name ?? '—'}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-sm font-semibold text-danger">{formatMad(v)}</span>
                      {canWrite && <Btn tone="ghost" onClick={() => remind(o, residence.name, v, lang, office.name)}><MessageCircle className="h-4 w-4" /> {t('Remind')}</Btn>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {lotForm && <LotForm office={office} residenceId={residence.id} lot={lotForm.lot} owner={lotForm.lot?.owner_person_id ? data?.owners.get(lotForm.lot.owner_person_id) : undefined} onClose={() => setLotForm(null)} onSaved={() => { setLotForm(null); load(); }} />}
      {callForm && data && <CallForm residenceId={residence.id} lots={data.lots} onClose={() => setCallForm(false)} onSaved={() => { setCallForm(false); setTab('calls'); load(); }} />}
      {editRes && <ResidenceForm office={office} residence={residence} onClose={() => setEditRes(false)} onSaved={() => { setEditRes(false); onChanged(); }} />}
    </div>
  );
}

/** Syndic de copropriété: the residences the office manages. */
export function Syndic({ office }: { office: Office }) {
  const [rows, setRows] = useState<Residence[] | null | undefined>(undefined);
  const [arrears, setArrears] = useState<Map<string, number>>(new Map());
  const [lots, setLots] = useState<Map<string, number>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    const r = await loadResidences(office.id);
    setRows(r);
    if (!r) return;
    const [a, l] = await Promise.all([office.role === 'viewer' ? Promise.resolve(new Map<string, number>()) : loadArrears(office.id), supabase.from('residence_lots').select('residence_id').eq('org_id', office.id)]);
    setArrears(a);
    const m = new Map<string, number>(); for (const x of (l.data ?? []) as { residence_id: string }[]) m.set(x.residence_id, (m.get(x.residence_id) ?? 0) + 1);
    setLots(m);
  }, [office.id, office.role]);
  useEffect(() => { load(); }, [load]);

  const opened = rows?.find(r => r.id === openId);
  if (opened) return <ResidenceView key={opened.id} office={office} residence={opened} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Syndic')}</h1>
          <p className="text-sm text-muted">{t('The residences you manage as syndic: lots, co-owners, calls for funds and unpaid charges.')}</p>
        </div>
        {canWrite && rows && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('New residence')}</Btn>}
      </div>
      {rows === undefined && <p className="mt-10 text-center text-muted">…</p>}
      {rows === null && <p className="mt-6 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 9a first.')}</p>}
      {rows && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Building className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No residences yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Add a residence, its lots with tantièmes and co-owners, then issue calls for funds.')}</p>
        </Card>
      )}
      {rows && rows.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {rows.map(r => {
            const a = arrears.get(r.id) ?? 0;
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="card w-full rounded-2xl p-4 text-start transition hover:ring-2 hover:ring-brand/30 sm:p-5">
                  <p className="font-display text-lg font-semibold">{r.name}</p>
                  <p className="text-sm text-muted">{r.city ?? '—'} · {t('{n} lots', { n: lots.get(r.id) ?? 0 })}</p>
                  {office.role !== 'viewer' && <p className={`mt-2 text-sm font-semibold ${a ? 'text-danger' : 'text-ok'}`}>{a ? t('{amount} unpaid', { amount: formatMad(a) }) : t('Everyone is up to date.')}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <ResidenceForm office={office} onClose={() => setAdding(false)} onSaved={id => { setAdding(false); load().then(() => setOpenId(id)); }} />}
    </div>
  );
}
