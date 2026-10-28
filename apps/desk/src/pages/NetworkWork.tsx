import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownLeft, ArrowUpRight, FileText, MessageCircle, Printer, Send, X } from 'lucide-react';
import { formatMad, dirhamToCents, type DealPurpose, type PropertyType } from '@vastgoed/shared';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { collabStatusLabel, networkCall, referralStatusLabel, type Collab, type CollabStatus, type NetProperty, type Partner, type Referral } from '../lib/network';
import { purposeLabel, typeLabel } from '../lib/labels';
import { waLink } from '../components/ContactLinks';
import { Btn, Field, Modal, inputCls } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(d));
const when = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const dh = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? dirhamToCents(v) : null; };
const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
const TYPES: PropertyType[] = ['apartment', 'villa', 'house', 'riad', 'land', 'shop', 'office', 'building'];
const wa = (n: string | null, text: string) => window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
const splitOf = (c: Collab) => { const total = c.commission_cents ?? 0; const partner = Math.round(total * c.partner_share_pct / 100); return { total, partner, listing: total - partner }; };

// ---------------------------------------------------------------- send a client to a partner
export function ReferralForm({ office, partners, onClose, onSent }: { office: Office; partners: Partner[]; onClose: () => void; onSent: () => void }) {
  const ok = partners.filter(p => p.status === 'accepted');
  const [f, setF] = useState({ partner: ok[0]?.org_id ?? '', name: '', phone: '', purpose: 'sale' as DealPurpose, city: '', types: [] as PropertyType[], budget: '', note: '', fee: '25', consent: false });
  const [error, setError] = useState<string | null>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.consent) { setError(t('The client must agree that you pass on their details.')); return; }
    const err = await networkCall('send_referral', { p_org: office.id, p_partner: f.partner, p_name: f.name, p_phone: f.phone, p_purpose: f.purpose, p_city: f.city || null,
      p_types: f.types, p_budget_cents: dh(f.budget), p_note: f.note || null, p_fee_pct: Number(f.fee.replace(',', '.')) || 0, p_consent: f.consent });
    if (err) setError(err); else onSent();
  };
  return (
    <Modal title={t('Send a client to a partner')} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="ref-form" disabled={!f.partner}><Send className="h-4 w-4" /> {t('Send')}</Btn></div>}>
      <form id="ref-form" onSubmit={send} className="space-y-3">
        <p className="text-sm text-muted">{t('A client you cannot help (another city, another budget)? Send them to a partner and earn a referral fee when it works out.')}</p>
        <Field label={t('Partner office')}><select className={inputCls} value={f.partner} onChange={e => setF({ ...f, partner: e.target.value })}>{ok.map(p => <option key={p.org_id} value={p.org_id}>{p.name}{p.city ? ` · ${p.city}` : ''}</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Client name')}><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} /></Field>
          <Field label={t('Phone or WhatsApp')}><input className={inputCls} dir="ltr" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={40} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">{PURPOSES.map(p => <button key={p} type="button" aria-pressed={f.purpose === p} onClick={() => setF({ ...f, purpose: p })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.purpose === p ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{purposeLabel(p)}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{TYPES.map(x => <button key={x} type="button" aria-pressed={f.types.includes(x)} onClick={() => setF({ ...f, types: f.types.includes(x) ? f.types.filter(y => y !== x) : [...f.types, x] })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.types.includes(x) ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{typeLabel(x)}</button>)}</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('City')}><input className={inputCls} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} maxLength={100} /></Field>
          <Field label={t('Budget up to (DH)')}><input className={inputCls} inputMode="decimal" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} /></Field>
          <Field label={t('Referral fee (%)')} hint={t('of their commission')}><input className={inputCls} inputMode="decimal" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} /></Field>
        </div>
        <Field label={t('Note for the partner')}><textarea className={inputCls} rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={1000} /></Field>
        <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm"><input type="checkbox" className="mt-1" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />
          <span>{t('The client agrees that I pass their name and number to this office (loi 09-08).')}</span></label>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

export function ReferralsTab({ referrals, canWrite, run }: { referrals: Referral[]; canWrite: boolean; run: (fn: string, args: Record<string, unknown>) => void }) {
  const close = (r: Referral, won: boolean) => {
    if (!won) { if (window.confirm(t('Mark as not concluded?'))) run('close_referral', { p_id: r.id, p_won: false }); return; }
    const v = window.prompt(t('Commission you earned with this client (DH)'));
    if (v === null) return;
    const c = dh(v); if (c === null) return;
    run('close_referral', { p_id: r.id, p_won: true, p_commission_cents: c });
  };
  if (referrals.length === 0) return <p className="mt-6 text-center text-sm text-muted">{t('No referrals yet. Send a client you cannot help to a partner, or receive clients from them.')}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {referrals.map(r => (
        <li key={r.id} className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="flex items-start gap-2">{r.outgoing ? <ArrowUpRight className="mt-0.5 h-4 w-4 text-muted" /> : <ArrowDownLeft className="mt-0.5 h-4 w-4 text-brand" />}
              <span><span className="font-semibold">{r.client_name}</span> <span className="text-xs text-muted">· {r.outgoing ? t('to {office}', { office: r.office }) : t('from {office}', { office: r.office })} · {day(r.created_at)}</span>
                <span className="block text-xs text-muted">{[purposeLabel(r.purpose), r.property_types.map(typeLabel).join(', '), r.city, r.budget_max_cents ? `≤ ${formatMad(r.budget_max_cents)}` : null].filter(Boolean).join(' · ')}</span></span></span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === 'won' ? 'bg-ok/10 text-ok' : r.status === 'declined' || r.status === 'lost' ? 'bg-surface text-muted' : 'bg-brand/10 text-brand'}`}>{referralStatusLabel(r.status)}</span>
          </div>
          {r.note && <p className="mt-1 text-xs">{r.note}</p>}
          <p className="mt-1 text-xs text-muted">{t('Referral fee {pct}% of the commission', { pct: Number(r.fee_pct) })}{r.fee_cents !== null ? ` · ${formatMad(r.fee_cents)}` : ''}{r.status === 'won' ? ` · ${r.fee_paid_on ? t('paid {date}', { date: day(r.fee_paid_on) }) : t('not paid yet')}` : ''}</p>
          {canWrite && !r.outgoing && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.status === 'sent' && <><Btn tone="brand" onClick={() => run('respond_referral', { p_id: r.id, p_accept: true })}>{t('Accept')}</Btn><Btn tone="ghost" onClick={() => run('respond_referral', { p_id: r.id, p_accept: false })}>{t('Decline')}</Btn></>}
              {r.status === 'accepted' && <><Btn tone="ghost" onClick={() => close(r, true)}>{t('Won')}</Btn><Btn tone="ghost" onClick={() => close(r, false)}>{t('Not concluded')}</Btn></>}
              {r.status === 'won' && <Btn tone="ghost" onClick={() => run('referral_fee_paid', { p_id: r.id, p_paid: !r.fee_paid_on })}>{r.fee_paid_on ? t('Undo payment') : t('Fee paid')}</Btn>}
              {r.client_phone && r.status !== 'declined' && <Btn tone="ghost" onClick={() => wa(r.client_phone, '')}><MessageCircle className="h-4 w-4" /> {t('Client on WhatsApp')}</Btn>}
            </div>
          )}
          {r.outgoing && r.status !== 'declined' && <div className="mt-2"><Btn tone="ghost" onClick={() => wa(r.office_whatsapp, t('Hello, any news about {name}, the client I sent you?', { name: r.client_name }))}><MessageCircle className="h-4 w-4" /> {t('Ask the partner')}</Btn></div>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- a client of mine for a partner's property
export function ProposeCollab({ office, p, onClose, onSent }: { office: Office; p: NetProperty; onClose: () => void; onSent: () => void }) {
  const [client, setClient] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (client.trim().length < 2) { setError(t('Enter the name of your client.')); return; }
    const err = await networkCall('propose_collab', { p_org: office.id, p_share: p.share_id, p_client: client.trim(), p_note: note.trim() || null });
    if (err) setError(err); else onSent();
  };
  return (
    <Modal title={t('I have a client for {ref}', { ref: p.reference })} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="col-form">{t('Propose')}</Btn></div>}>
      <form id="col-form" onSubmit={send} className="space-y-3">
        <p className="text-sm">{p.title} · {p.office}</p>
        <p className="rounded-xl bg-brand/10 px-3 py-2 text-sm font-semibold text-brand">{t('Your share: {n}% of the commission', { n: Number(p.commission_pct ?? 50) })}</p>
        <Field label={t('Client name')}><input className={inputCls} value={client} onChange={e => setClient(e.target.value)} maxLength={120} /></Field>
        <Field label={t('Message for the office')}><textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={t('For example: can we visit on Saturday morning?')} /></Field>
        <p className="text-xs text-muted">{t('The office sees the name of your client only when it accepts. Your client stays yours.')}</p>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function CollabDoc({ office, c, onClose }: { office: Office; c: Collab; onClose: () => void }) {
  const s = splitOf(c);
  const listingName = c.listing ? office.name : c.office;
  const partnerName = c.listing ? c.office : office.name;
  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-3xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir="ltr" lang="fr">
        <div className="no-print mb-5 flex items-center justify-between gap-2">
          <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="text-[13px] leading-relaxed">
          <p className="text-center text-lg font-black uppercase tracking-wide">Convention de collaboration inter-agences</p>
          <p className="mt-4">Entre <span className="font-semibold">{listingName}</span>, titulaire du mandat (ci-après « l’agence mandataire »),</p>
          <p>et <span className="font-semibold">{partnerName}</span>, qui présente un client (ci-après « l’agence partenaire »).</p>
          <p className="mt-3"><span className="font-semibold">Bien concerné :</span> {c.title} (réf. {c.reference}){c.city ? `, ${c.city}` : ''}{c.property_price_cents ? `, proposé à ${formatMad(c.property_price_cents)}` : ''}.</p>
          <p><span className="font-semibold">Client présenté :</span> {c.client_name ?? '—'}.</p>
          <p className="mt-3">1. L’agence partenaire présente le client ci-dessus pour le bien concerné. L’agence mandataire organise les visites et la négociation avec le propriétaire.</p>
          <p>2. En cas de vente ou de location du bien à ce client, ou à toute personne qui lui est liée, dans les douze mois, la commission perçue par l’agence mandataire est partagée : <span className="font-semibold">{100 - c.partner_share_pct} % pour l’agence mandataire et {c.partner_share_pct} % pour l’agence partenaire</span>.</p>
          <p>3. L’agence mandataire verse la part de l’agence partenaire dans les quinze jours suivant l’encaissement de la commission, sur présentation d’une facture.</p>
          <p>4. Chaque agence s’engage à ne pas contacter directement le client ou le propriétaire de l’autre en dehors de cette collaboration.</p>
          {s.total > 0 && <p className="mt-3 rounded-lg border border-black/15 p-3">Commission totale : {formatMad(s.total)} · part de l’agence mandataire : {formatMad(s.listing)} · part de l’agence partenaire : {formatMad(s.partner)}{c.price_cents ? ` (prix : ${formatMad(c.price_cents)})` : ''}.</p>}
          <p className="mt-4">Fait le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}, en deux exemplaires.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">{[listingName, partnerName].map(x => <div key={x} className="h-24 rounded-lg border border-black/15 p-3 text-[11px] font-bold uppercase text-black/60">{x}</div>)}</div>
        </div>
      </div>
    </div>
  ), document.body);
}

const NEXT: CollabStatus[] = ['visit', 'offer', 'signed'];
export function CollabsTab({ office, collabs, canWrite, run }: { office: Office; collabs: Collab[]; canWrite: boolean; run: (fn: string, args: Record<string, unknown>) => void }) {
  const [doc, setDoc] = useState<Collab | null>(null);
  const step = (c: Collab, s: CollabStatus) => {
    if (s === 'visit') {
      const v = window.prompt(t('Date and time of the viewing (YYYY-MM-DD HH:MM)'), new Date(Date.now() + 86400000).toISOString().slice(0, 10) + ' 10:00');
      if (v === null) return;
      const d = new Date(v.replace(' ', 'T'));
      run('update_collab', { p_id: c.id, p_status: 'visit', p_visit_at: Number.isNaN(d.getTime()) ? null : d.toISOString() });
      return;
    }
    if (s === 'signed' && c.listing) {
      const price = window.prompt(t('Agreed price (DH)'), c.property_price_cents ? String(c.property_price_cents / 100) : '');
      if (price === null) return;
      const com = window.prompt(t('Total commission (DH)'));
      if (com === null) return;
      run('update_collab', { p_id: c.id, p_status: 'signed', p_price_cents: dh(price), p_commission_cents: dh(com) });
      return;
    }
    run('update_collab', { p_id: c.id, p_status: s });
  };
  if (collabs.length === 0) return <p className="mt-6 text-center text-sm text-muted">{t('No collaborations yet. Propose a client for a property a partner shares with you.')}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {collabs.map(c => { const s = splitOf(c); const open = !['proposed', 'paid', 'declined', 'cancelled'].includes(c.status); return (
        <li key={c.id} className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span><span className="font-semibold">{c.title}</span> <span className="text-xs text-muted">· {c.reference}</span>
              <span className="block text-xs text-muted">{c.listing ? t('Client of {office}: {name}', { office: c.office, name: c.client_name ?? t('shown after accepting') }) : t('Property of {office} · your client: {name}', { office: c.office, name: c.client_name ?? '' })}</span></span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === 'paid' ? 'bg-ok/10 text-ok' : c.status === 'declined' || c.status === 'cancelled' ? 'bg-surface text-muted' : 'bg-brand/10 text-brand'}`}>{collabStatusLabel(c.status)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{t('Split: {a}% for the office of the property, {b}% for the partner', { a: 100 - c.partner_share_pct, b: c.partner_share_pct })}
            {s.total > 0 ? ` · ${formatMad(s.total)} → ${formatMad(c.listing ? s.listing : s.partner)} ${t('for you')}` : ''}{c.visit_at ? ` · ${t('viewing {date}', { date: when(c.visit_at) })}` : ''}{c.paid_on ? ` · ${t('paid {date}', { date: day(c.paid_on) })}` : ''}</p>
          {c.note && <p className="mt-1 text-xs">{c.note}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canWrite && c.status === 'proposed' && c.listing && <><Btn tone="brand" onClick={() => run('respond_collab', { p_id: c.id, p_accept: true })}>{t('Accept')}</Btn><Btn tone="ghost" onClick={() => run('respond_collab', { p_id: c.id, p_accept: false })}>{t('Decline')}</Btn></>}
            {canWrite && open && NEXT.filter(x => NEXT.indexOf(x) > NEXT.indexOf(c.status as CollabStatus) && (x !== 'signed' || c.listing)).map(x => <Btn key={x} tone="ghost" onClick={() => step(c, x)}>{collabStatusLabel(x)}</Btn>)}
            {canWrite && c.listing && c.status === 'signed' && <Btn tone="brand" onClick={() => run('update_collab', { p_id: c.id, p_status: 'paid' })}>{t('Partner share paid')}</Btn>}
            {canWrite && open && <Btn tone="ghost" onClick={() => { if (window.confirm(t('Cancel this collaboration?'))) run('update_collab', { p_id: c.id, p_status: 'cancelled' }); }}>{t('Cancel')}</Btn>}
            {c.status !== 'proposed' && c.status !== 'declined' && <Btn tone="ghost" onClick={() => setDoc(c)}><FileText className="h-4 w-4" /> {t('Agreement')}</Btn>}
            <Btn tone="ghost" onClick={() => wa(c.office_whatsapp || c.office_phone, `${c.title} (${c.reference})`)}><MessageCircle className="h-4 w-4" /> {c.office}</Btn>
          </div>
        </li>); })}
      {doc && <CollabDoc office={office} c={doc} onClose={() => setDoc(null)} />}
    </ul>
  );
}
