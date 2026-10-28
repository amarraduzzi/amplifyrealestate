import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileText, HardHat, MessageCircle, Plus, Printer, Trash2, X } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import {
  BUILD_STEPS, RESERVATION_TEMPLATE, VEFA_TEMPLATE, dueOf, milestoneLabel, projectError, saleError, saleStatusLabel, unitKindLabel,
  type Buyer, type BuildStep, type Installment, type MilestoneKey, type Project, type Sale, type SaleKind, type Step, type Tranche, type Unit,
} from '../lib/projects';
import { loadBilling, amountInWords, type Billing } from '../lib/invoices';
import { planError } from '../lib/plan';
import { waLink } from '../components/ContactLinks';
import { Btn, Field, Modal, inputCls } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const dayFr = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);
const err = (m: string) => { const x = saleError(m) ?? projectError(m); return x ? t(x) : planError(m); };
const pctNum = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const MILESTONES: MilestoneKey[] = ['contract', 'foundations', 'structure', 'finishing', 'keys', 'deed', 'date'];
const STEP_FR: Record<MilestoneKey, string> = { contract: 'la signature du contrat', foundations: 'l’achèvement des fondations', structure: 'l’achèvement du gros œuvre', finishing: 'l’achèvement des travaux de finition', keys: 'la remise des clés', deed: 'la signature de l’acte définitif', date: 'l’échéance convenue' };

export type SaleData = { sales: Sale[]; installments: Installment[] };
type Ctx = { office: Office; project: Project; tranches: Tranche[]; units: Unit[]; buyers: Map<string, Buyer> };
const trancheOf = (c: Ctx, unitId: string) => c.tranches.find(x => x.id === c.units.find(u => u.id === unitId)?.tranche_id);

export function saleMoney(c: Ctx, sale: Sale, inst: Installment[]) {
  const mine = inst.filter(i => i.sale_id === sale.id);
  const paid = mine.reduce((s, i) => s + i.paid_cents, 0);
  const due = mine.filter(i => { const d = dueOf(i, sale, c.project, trancheOf(c, sale.unit_id)); return d !== null && d <= today(); });
  const late = due.reduce((s, i) => s + i.amount_cents - i.paid_cents, 0);
  const next = mine.find(i => i.paid_cents < i.amount_cents);
  return { paid, late, next, mine };
}

function sendWa(phone: string | null | undefined, text: string) {
  window.open(phone ? `${waLink(phone)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
function callText(lang: 'fr' | 'ar', name: string, project: string, ref: string, i: Installment, office: string) {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const left = formatMad(i.amount_cents - i.paid_cents);
  return lang === 'ar'
    ? `مرحبا ${first}، نخبركم بأن مرحلة "${i.label}" من مشروع ${project} قد بلغت. المرجو أداء القسط المتعلق بالوحدة ${ref}: ${left}. شكرا لكم.\n— ${office}`
    : `Bonjour ${first}, nous vous informons que l’étape « ${i.label} » du projet ${project} est atteinte. Merci de régler l’échéance correspondante pour le lot ${ref} : ${left}.\n— ${office}`;
}

// ---------------------------------------------------------------- reserve or sell a unit
export function SaleForm({ ctx, unit, onClose, onSaved }: { ctx: Ctx; unit: Unit; onClose: () => void; onSaved: () => void }) {
  const prior = ctx.buyers.get(unit.id);
  const [kind, setKind] = useState<SaleKind>('vefa');
  const [steps, setSteps] = useState<Step[]>(VEFA_TEMPLATE());
  const [f, setF] = useState({ name: prior?.buyer_name ?? '', phone: prior?.buyer_phone ?? '', price: unit.price_cents ? String(unit.price_cents / 100) : '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const priceCents = dirhamToCents(pctNum(f.price.replace(/\s/g, '')));
  const total = steps.reduce((s, x) => s + pctNum(x.pct), 0);
  const ctr = steps.filter(x => x.milestone === 'contract').reduce((s, x) => s + pctNum(x.pct), 0);
  const keys = steps.filter(x => x.milestone === 'keys' || x.milestone === 'deed').reduce((s, x) => s + pctNum(x.pct), 0);
  const vefaBad = kind === 'vefa' && (ctr > 5 || keys < 20);
  const pick = (k: SaleKind) => { setKind(k); setSteps(k === 'vefa' ? VEFA_TEMPLATE() : RESERVATION_TEMPLATE()); };
  const set = (i: number, p: Partial<Step>) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError(t('Enter the buyer.')); return; }
    if (priceCents <= 0) { setError(t('Enter the price.')); return; }
    if (Math.abs(total - 100) > 0.001) { setError(t('The installments must add up to exactly 100%.')); return; }
    if (vefaBad) { setError(t('Loi 107-12: at most 5% at the preliminary contract and at least 20% at the keys.')); return; }
    setBusy(true);
    let buyerId = prior?.buyer_person_id;
    if (!buyerId || prior?.buyer_name !== f.name.trim()) {
      const p = await supabase.from('people').insert({ org_id: ctx.office.id, full_name: f.name.trim(), phone: f.phone.trim() || null, whatsapp: f.phone.trim() || null, notes: `Acquéreur ${ctx.project.name}` }).select('id').single();
      if (p.error) { setBusy(false); setError(err(p.error.message)); return; }
      buyerId = (p.data as { id: string }).id;
    }
    const { error } = await supabase.rpc('create_dev_sale', {
      p_unit: unit.id, p_buyer: buyerId, p_price_cents: priceCents, p_kind: kind, p_notes: f.notes.trim() || null,
      p_schedule: steps.map(x => ({ label: x.label.trim() || milestoneLabel(x.milestone), milestone: x.milestone, pct: pctNum(x.pct), due_date: x.due_date || null })),
    });
    setBusy(false);
    if (error) { setError(err(error.message)); return; }
    onSaved();
  };
  return (
    <Modal title={t('Reserve {ref}', { ref: unit.reference })} onClose={onClose}
      footer={<div className="flex items-center justify-between gap-2"><span className={`text-sm font-semibold ${Math.abs(total - 100) > 0.001 || vefaBad ? 'text-danger' : 'text-ok'}`}>{t('Total {pct}%', { pct: Math.round(total * 1000) / 1000 })}</span><span className="flex gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="sale-form" disabled={busy}>{t('Reserve')}</Btn></span></div>}>
      <form id="sale-form" onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Buyer')}><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={200} /></Field>
          <Field label={t('Phone or WhatsApp')}><input className={inputCls} dir="ltr" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={40} /></Field>
        </div>
        <Field label={t('Sale price (DH)')}><input className={inputCls} inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field>
        <div className="flex gap-1.5">
          {(['vefa', 'reservation'] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === k ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{k === 'vefa' ? t('Sale on plan (VEFA)') : t('Reservation with deposit')}</button>)}
        </div>
        <p className="text-xs text-muted">{kind === 'vefa' ? t('Loi 107-12: at most 5% at the preliminary contract, 75% spread over foundations, structural work and finishing, 20% at the keys.') : t('A deposit now, the balance at the final deed. Adjust the steps if you agreed otherwise.')}</p>
        <div className="space-y-2">
          {steps.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_auto] gap-1.5 rounded-xl bg-surface-2 p-2 sm:grid-cols-[1.3fr_1fr_4.5rem_auto]">
              <input className={`${inputCls} col-span-3 sm:col-span-1`} value={x.label} onChange={e => set(i, { label: e.target.value })} maxLength={120} aria-label={t('Label')} />
              <select className={inputCls} value={x.milestone} onChange={e => set(i, { milestone: e.target.value as MilestoneKey })} aria-label={t('When')}>
                {MILESTONES.map(m => <option key={m} value={m}>{milestoneLabel(m)}</option>)}
              </select>
              <input className={`${inputCls} text-end`} inputMode="decimal" value={x.pct} onChange={e => set(i, { pct: e.target.value })} aria-label="%" />
              <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length < 2} aria-label={t('Remove')} className="grid w-8 place-items-center text-muted hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              {x.milestone === 'date' && <input type="date" className={`${inputCls} col-span-3 sm:col-span-4`} value={x.due_date} onChange={e => set(i, { due_date: e.target.value })} />}
              {priceCents > 0 && <span className="col-span-3 text-end text-xs text-muted tabular sm:col-span-4">{formatMad(Math.floor(priceCents * pctNum(x.pct) / 100))}</span>}
            </div>
          ))}
          <Btn type="button" tone="ghost" onClick={() => setSteps([...steps, { label: '', milestone: 'date', pct: '', due_date: '' }])}><Plus className="h-4 w-4" /> {t('Add an installment')}</Btn>
        </div>
        <Field label={t('Notes')}><textarea className={inputCls} rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={2000} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- the call for funds, printable
function CallDoc({ ctx, sale, inst, buyer, unit, onClose }: { ctx: Ctx; sale: Sale; inst: Installment; buyer: Buyer | undefined; unit: Unit | undefined; onClose: () => void }) {
  const [b, setB] = useState<Billing | null>(null);
  useEffect(() => { loadBilling(ctx.office.id).then(setB); }, [ctx.office.id]);
  const due = dueOf(inst, sale, ctx.project, trancheOf(ctx, sale.unit_id));
  const left = inst.amount_cents - inst.paid_cents;
  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-3xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir="ltr" lang="fr">
        <div className="no-print mb-5 flex items-center justify-between gap-2">
          <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="text-[13px] leading-relaxed">
          <div className="flex justify-between gap-6">
            <div><p className="text-base font-bold">{b?.legal_name || ctx.office.name}</p>{b?.legal_address && <p>{b.legal_address}</p>}{b?.ice && <p>ICE : {b.ice}</p>}</div>
            <div className="text-end"><p className="font-semibold">{buyer?.buyer_name ?? ''}</p><p>{ctx.office.city ? `${ctx.office.city}, ` : ''}le {dayFr(today())}</p></div>
          </div>
          <p className="mt-8 text-center text-lg font-black uppercase tracking-wide">Appel de fonds</p>
          <p className="text-center font-semibold">{ctx.project.name} · Lot {unit?.reference}{unit ? ` (${unitKindLabel(unit.kind).toLowerCase()}${unit.area_m2 ? `, ${unit.area_m2} m²` : ''})` : ''}</p>
          <p className="mt-6">Madame, Monsieur,</p>
          <p className="mt-2">Conformément au contrat {sale.kind === 'vefa' ? 'de vente en l’état futur d’achèvement (loi 44-00 modifiée par la loi 107-12)' : 'de réservation'} relatif au lot {unit?.reference} du projet {ctx.project.name}{ctx.project.city ? ` à ${ctx.project.city}` : ''}, au prix de {formatMad(sale.price_cents)}, nous vous informons que l’étape « {inst.label} »{due ? `, correspondant à ${STEP_FR[inst.milestone]}, est atteinte depuis le ${dayFr(due)}` : ''}.</p>
          <p className="mt-2">Nous vous prions de bien vouloir régler l’échéance n° {inst.position}, soit {Number(inst.pct)} % du prix :</p>
          <p className="my-4 rounded-lg border border-black/15 p-3 text-center text-base font-bold">{formatMad(left)}{inst.paid_cents > 0 ? ` (reste à payer sur ${formatMad(inst.amount_cents)})` : ''}<span className="block text-xs font-normal">{amountInWords(left)}</span></p>
          {b?.rib && <p>Par virement sur le compte : <span className="font-semibold tabular">{b.rib}</span>, en indiquant la référence « {ctx.project.name} {unit?.reference} ».</p>}
          <p className="mt-4">Nous vous remercions de votre confiance et restons à votre disposition.</p>
          <p className="mt-6 font-semibold">{b?.legal_name || ctx.office.name}</p>
        </div>
      </div>
    </div>
  ), document.body);
}

// ---------------------------------------------------------------- one sale: schedule, payments, status
export function SaleView({ ctx, sale, data, onClose, onChanged, onEditUnit }: { ctx: Ctx; sale: Sale; data: SaleData; onClose: () => void; onChanged: () => void; onEditUnit: () => void }) {
  const unit = ctx.units.find(u => u.id === sale.unit_id);
  const buyer = ctx.buyers.get(sale.unit_id);
  const m = saleMoney(ctx, sale, data.installments);
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [doc, setDoc] = useState<Installment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = ctx.office.role === 'owner' || ctx.office.role === 'manager';
  const open = sale.status === 'reserved' || sale.status === 'signed';
  const rpc = async (fn: string, args: Record<string, unknown>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    const { error } = await supabase.rpc(fn, args);
    if (error) setError(err(error.message)); else { setError(null); onChanged(); }
  };
  const pay = async (i: Installment, full: boolean) => {
    let amount = i.amount_cents;
    if (!full) {
      const v = window.prompt(t('Amount paid (DH)'), String((i.amount_cents - i.paid_cents) / 100));
      if (v === null) return;
      amount = Math.min(i.amount_cents, i.paid_cents + dirhamToCents(pctNum(v.replace(/\s/g, ''))));
    }
    const r = await supabase.from('dev_installments').update({ paid_cents: amount, paid_on: null }).eq('id', i.id).select('id');
    if (r.error) setError(err(r.error.message)); else onChanged();
  };
  const remind = async (i: Installment) => {
    sendWa(buyer?.buyer_phone, callText(lang, buyer?.buyer_name ?? '', ctx.project.name, unit?.reference ?? '', i, ctx.office.name));
    await supabase.from('dev_installments').update({ reminded_on: today() }).eq('id', i.id);
    onChanged();
  };
  return (
    <Modal title={`${unit?.reference ?? ''} · ${buyer?.buyer_name ?? ''}`} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Btn tone="ghost" onClick={onEditUnit}>{t('Edit the unit')}</Btn>
        {open && (sale.status === 'reserved' || canManage) && <Btn tone="ghost" onClick={() => rpc('cancel_dev_sale', { p_sale: sale.id }, t('Cancel this sale? The unit becomes available again. Payments already received stay recorded.'))}>{t('Cancel the sale')}</Btn>}
        {sale.status === 'reserved' && <Btn tone="brand" onClick={() => rpc('sign_dev_sale', { p_sale: sale.id })}><FileText className="h-4 w-4" /> {t('Contract signed')}</Btn>}
        {sale.status === 'signed' && <Btn tone="brand" onClick={() => rpc('deliver_dev_sale', { p_sale: sale.id })}><Check className="h-4 w-4" /> {t('Keys handed over')}</Btn>}
      </div>}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold">{saleStatusLabel(sale.status)}</span>
        <span className="text-xs text-muted">{sale.kind === 'vefa' ? 'VEFA' : t('Reservation')} · {t('since {date}', { date: day(sale.reserved_on) })}{sale.signed_on ? ` · ${t('signed {date}', { date: day(sale.signed_on) })}` : ''}</span>
        <span className="ms-auto flex gap-1">{(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{l}</button>)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-surface-2 p-3"><p className="font-display tabular whitespace-nowrap text-base font-bold">{formatMad(sale.price_cents)}</p><p className="text-xs text-muted">{t('Price')}</p></div>
        <div className="rounded-2xl bg-ok/10 p-3"><p className="font-display tabular whitespace-nowrap text-base font-bold text-ok">{formatMad(m.paid)}</p><p className="text-xs text-muted">{t('Received')}</p></div>
        <div className={`rounded-2xl p-3 ${m.late ? 'bg-danger/10' : 'bg-surface-2'}`}><p className={`font-display tabular whitespace-nowrap text-base font-bold ${m.late ? 'text-danger' : ''}`}>{formatMad(m.late)}</p><p className="text-xs text-muted">{t('Due now')}</p></div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {m.mine.map(i => {
          const due = dueOf(i, sale, ctx.project, trancheOf(ctx, sale.unit_id));
          const paid = i.paid_cents >= i.amount_cents;
          const late = !paid && due !== null && due <= today();
          return (
            <li key={i.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0"><span className="font-semibold">{i.position}. {i.label}</span> <span className="text-xs text-muted">· {Number(i.pct)}%</span>
                  <span className="block text-xs text-muted">{due ? t('Due since {date}', { date: day(due) }) : t('Not due yet: {step}', { step: milestoneLabel(i.milestone) })}{i.reminded_on ? ` · ${t('reminded {date}', { date: day(i.reminded_on) })}` : ''}</span></span>
                <span className="shrink-0 text-end"><span className={`tabular block font-semibold ${late ? 'text-danger' : ''}`}>{formatMad(i.amount_cents)}</span>
                  <span className={`text-xs font-bold ${paid ? 'text-ok' : i.paid_cents ? 'text-warn' : 'text-muted'}`}>{paid ? t('Paid') : i.paid_cents ? t('{amount} paid', { amount: formatMad(i.paid_cents) }) : late ? t('Late') : t('To be paid')}</span></span>
              </div>
              {sale.status !== 'cancelled' && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!paid && <button type="button" onClick={() => pay(i, true)} className="rounded-lg bg-ok/10 px-2.5 py-1 text-xs font-semibold text-ok">{t('+ Received')}</button>}
                  {!paid && <button type="button" onClick={() => pay(i, false)} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10">{t('Part')}</button>}
                  {i.paid_cents > 0 && <button type="button" onClick={async () => { await supabase.from('dev_installments').update({ paid_cents: 0 }).eq('id', i.id); onChanged(); }} className="text-xs font-semibold text-muted">{t('Undo payment')}</button>}
                  {!paid && due && <button type="button" onClick={() => remind(i)} className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-ok ring-1 ring-line/10"><MessageCircle className="h-3.5 w-3.5" /> {t('Reminder')}</button>}
                  {!paid && due && <button type="button" onClick={() => setDoc(i)} className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10"><Printer className="h-3.5 w-3.5" /> {t('Call for funds')}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {sale.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted">{sale.notes}</p>}
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {doc && <CallDoc ctx={ctx} sale={sale} inst={doc} buyer={buyer} unit={unit} onClose={() => setDoc(null)} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- the list of sales
export function SalesTab({ ctx, data, onOpen }: { ctx: Ctx; data: SaleData; onOpen: (s: Sale) => void }) {
  const [showCancelled, setShowCancelled] = useState(false);
  const rows = useMemo(() => data.sales.filter(s => showCancelled || s.status !== 'cancelled').map(s => ({ s, m: saleMoney(ctx, s, data.installments) })), [ctx, data, showCancelled]);
  const live = rows.filter(r => r.s.status !== 'cancelled');
  const totals = { price: live.reduce((a, r) => a + r.s.price_cents, 0), paid: live.reduce((a, r) => a + r.m.paid, 0), late: live.reduce((a, r) => a + r.m.late, 0) };
  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-surface-2 p-3"><p className="font-display tabular whitespace-nowrap text-base font-bold sm:text-lg">{formatMad(totals.price)}</p><p className="text-xs text-muted">{t('Sold or reserved')}</p></div>
        <div className="rounded-2xl bg-ok/10 p-3"><p className="font-display tabular whitespace-nowrap text-base font-bold text-ok sm:text-lg">{formatMad(totals.paid)}</p><p className="text-xs text-muted">{t('Received')}</p></div>
        <div className={`rounded-2xl p-3 ${totals.late ? 'bg-danger/10' : 'bg-surface-2'}`}><p className={`font-display tabular whitespace-nowrap text-base font-bold sm:text-lg ${totals.late ? 'text-danger' : ''}`}>{formatMad(totals.late)}</p><p className="text-xs text-muted">{t('Due now')}</p></div>
      </div>
      {rows.length === 0 && <p className="mt-6 text-center text-sm text-muted">{t('No sales yet. Tap an available unit in the grid to reserve it.')}</p>}
      <ul className="mt-3 space-y-2">
        {rows.map(({ s, m }) => { const u = ctx.units.find(x => x.id === s.unit_id); return (
          <li key={s.id}><button type="button" onClick={() => onOpen(s)} className={`w-full rounded-2xl bg-surface-2 px-3.5 py-3 text-start text-sm hover:ring-2 hover:ring-brand/25 ${s.status === 'cancelled' ? 'opacity-50' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span><span className="font-semibold">{u?.reference}</span> · {ctx.buyers.get(s.unit_id)?.buyer_name ?? '—'} <span className="text-xs text-muted">· {saleStatusLabel(s.status)}</span></span>
              <span className="tabular text-sm">{formatMad(m.paid)} / {formatMad(s.price_cents)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface"><span className="block h-full bg-ok" style={{ width: `${Math.min(100, m.paid / s.price_cents * 100)}%` }} /></div>
            <p className={`mt-1 text-xs ${m.late ? 'font-semibold text-danger' : 'text-muted'}`}>{m.late ? t('{amount} due now', { amount: formatMad(m.late) }) : m.next ? t('Next: {label}', { label: m.next.label }) : t('Fully paid')}</p>
          </button></li>); })}
      </ul>
      {data.sales.some(s => s.status === 'cancelled') && <button type="button" onClick={() => setShowCancelled(!showCancelled)} className="mt-3 text-xs font-semibold text-muted">{showCancelled ? t('Hide cancelled sales') : t('Show cancelled sales')}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- building progress
export function WorksPanel({ ctx, data, onChanged }: { ctx: Ctx; data: SaleData; onChanged: () => void }) {
  const canWrite = ctx.office.role !== 'viewer';
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<BuildStep | null>(null);
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const setDate = async (table: 'dev_projects' | 'dev_tranches', id: string, step: BuildStep, v: string) => {
    const r = await supabase.from(table).update({ [`${step}_on`]: v || null }).eq('id', id).select('id');
    if (r.error) setError(err(r.error.message)); else { setError(null); onChanged(); }
  };
  const open = (step: BuildStep) => data.installments.filter(i => {
    const s = data.sales.find(x => x.id === i.sale_id);
    return s && (s.status === 'reserved' || s.status === 'signed') && i.milestone === step && i.paid_cents < i.amount_cents && dueOf(i, s, ctx.project, trancheOf(ctx, s.unit_id));
  });
  const rows: { table: 'dev_projects' | 'dev_tranches'; id: string; name: string; v: Partial<Record<`${BuildStep}_on`, string | null>> }[] = [
    { table: 'dev_projects', id: ctx.project.id, name: ctx.tranches.length ? t('Whole project') : ctx.project.name, v: ctx.project },
    ...ctx.tranches.map(x => ({ table: 'dev_tranches' as const, id: x.id, name: x.name, v: x })),
  ];
  return (
    <section className="mt-4 rounded-2xl bg-surface-2 p-3.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><HardHat className="h-4 w-4 text-brand" /> {t('Building progress')}</h3>
      <p className="mt-0.5 text-xs text-muted">{t('Fill in the date when a step is finished. The installments of that step then become due. A date for a tranche goes before the date of the whole project.')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-1 text-start font-semibold" />{BUILD_STEPS.map(s => <th key={s} className="px-1 py-1 text-start font-semibold">{milestoneLabel(s)}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-1 pe-2 font-semibold">{r.name}</td>
                {BUILD_STEPS.map(s => <td key={s} className="px-1 py-1"><input key={`${r.id}-${s}-${r.v[`${s}_on`] ?? ''}`} type="date" disabled={!canWrite} className="w-full rounded-lg border border-line/[0.12] bg-surface px-2 py-1 text-xs" defaultValue={r.v[`${s}_on`] ?? ''} onBlur={e => e.target.value !== (r.v[`${s}_on`] ?? '') && setDate(r.table, r.id, s, e.target.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BUILD_STEPS.map(s => { const n = open(s).length; return n ? <Btn key={s} tone="ghost" onClick={() => setSending(s)}><MessageCircle className="h-4 w-4" /> {t('Calls for funds: {step} ({n})', { step: milestoneLabel(s), n })}</Btn> : null; })}
        </div>
      )}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {sending && (
        <Modal title={milestoneLabel(sending)} onClose={() => setSending(null)} footer={<div className="flex justify-end"><Btn tone="brand" onClick={() => setSending(null)}>{t('Close')}</Btn></div>}>
          <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm text-muted">{t('Tap each buyer: WhatsApp opens with the call for funds.')}</p>
            <span className="flex gap-1">{(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{l}</button>)}</span></div>
          <ul className="space-y-1.5">
            {open(sending).map(i => { const s = data.sales.find(x => x.id === i.sale_id)!; const u = ctx.units.find(x => x.id === s.unit_id); const b = ctx.buyers.get(s.unit_id); return (
              <li key={i.id}><button type="button" onClick={async () => { sendWa(b?.buyer_phone, callText(lang, b?.buyer_name ?? '', ctx.project.name, u?.reference ?? '', i, ctx.office.name)); await supabase.from('dev_installments').update({ reminded_on: today() }).eq('id', i.id); onChanged(); }}
                className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm hover:ring-2 hover:ring-brand/25">
                <span className="text-start"><span className="font-semibold">{u?.reference}</span> · {b?.buyer_name}{i.reminded_on && <span className="block text-xs text-muted">{t('reminded {date}', { date: day(i.reminded_on) })}</span>}</span>
                <span className="flex items-center gap-2"><span className="tabular">{formatMad(i.amount_cents - i.paid_cents)}</span><MessageCircle className="h-4 w-4 text-ok" /></span></button></li>); })}
          </ul>
        </Modal>
      )}
    </section>
  );
}
