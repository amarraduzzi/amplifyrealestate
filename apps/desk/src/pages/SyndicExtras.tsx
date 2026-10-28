import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Gavel, Link2, Megaphone, MessageCircle, Plus, Printer, Trash2, Wrench, X } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import type { Lot, Owner, Residence } from '../lib/syndic';
import { PUBLIC_SITE } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { waLink } from '../components/ContactLinks';
import { Btn, Field, Modal, inputCls } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(d.length === 10 ? `${d}T00:00:00` : d));
const when = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'full', timeStyle: 'short' }).format(new Date(d));
const err = (m: string) => (m.includes('assembly_closed') ? t('This general meeting is closed: nothing can change anymore.') : planError(m));
const openWa = (o: Owner | undefined, text: string) => {
  const n = o?.whatsapp || o?.phone;
  window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
};

// ---------------------------------------------------------------- 9c: incidents in the common parts
type Incident = { id: string; title: string; location: string | null; description: string | null; urgent: boolean; status: 'open' | 'in_progress' | 'done' | 'cancelled'; cost_cents: number | null; reported_on: string; done_on: string | null; show_residents: boolean };
const LOCATIONS = ['Ascenseur', 'Escaliers', 'Hall d’entrée', 'Parking', 'Toiture', 'Façade', 'Piscine', 'Jardin', 'Éclairage commun', 'Interphone', 'Portail', 'Canalisations'];
const incStatus = (s: Incident['status']) => t(({ open: 'Reported', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' } as const)[s]);

export function IncidentsTab({ office, residence }: { office: Office; residence: Residence }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<Incident[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', location: '', description: '', urgent: false });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.from('residence_incidents').select('*').eq('residence_id', residence.id).order('reported_on', { ascending: false });
    setRows((r.data ?? []) as Incident[]);
  }, [residence.id]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) { setError(t('Describe the problem in a few words.')); return; }
    const r = await supabase.from('residence_incidents').insert({ org_id: office.id, residence_id: residence.id, title: f.title.trim(), location: f.location || null, description: f.description.trim() || null, urgent: f.urgent });
    if (r.error) { setError(err(r.error.message)); return; }
    setAdding(false); setF({ title: '', location: '', description: '', urgent: false }); load();
  };
  const set = async (i: Incident, patch: Partial<Incident>) => {
    const r = await supabase.from('residence_incidents').update(patch).eq('id', i.id).select('id');
    if (r.error) setError(err(r.error.message)); else load();
  };
  const cost = async (i: Incident) => {
    const v = window.prompt(t('Cost (DH)'), i.cost_cents ? String(i.cost_cents / 100) : '');
    if (v === null) return;
    const n = Number(v.replace(',', '.'));
    set(i, { cost_cents: Number.isFinite(n) && n > 0 ? dirhamToCents(n) : null });
  };

  return (
    <div className="mt-4">
      {canWrite && !adding && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Report a problem')}</Btn>}
      {adding && (
        <form onSubmit={add} className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={200} placeholder={t('For example: lift out of order')} />
          <select className={inputCls} value={f.location} onChange={e => setF({ ...f, location: e.target.value })}>
            <option value="">{t('Where? (optional)')}</option>
            {LOCATIONS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <textarea className={inputCls} rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={2000} placeholder={t('Details (optional)')} />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.urgent} onChange={e => setF({ ...f, urgent: e.target.checked })} /> {t('Urgent')}</label>
          <div className="flex justify-end gap-2"><Btn type="button" onClick={() => setAdding(false)}>{t('Cancel')}</Btn><Btn tone="brand" type="submit">{t('Save')}</Btn></div>
        </form>
      )}
      {rows.length === 0 && !adding && <p className="mt-6 text-center text-sm text-muted">{t('No problems reported.')}</p>}
      <ul className="mt-3 space-y-2">
        {rows.map(i => (
          <li key={i.id} className={`rounded-2xl bg-surface-2 px-3.5 py-3 ${i.status === 'cancelled' ? 'opacity-50' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 text-sm"><span className="font-semibold">{i.title}</span>{i.location && <span className="text-muted"> · {i.location}</span>}
                {i.urgent && i.status !== 'done' && <span className="ms-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{t('Urgent')}</span>}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${i.status === 'done' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{incStatus(i.status)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{day(i.reported_on)}{i.done_on ? ` → ${day(i.done_on)}` : ''}{i.cost_cents ? ` · ${formatMad(i.cost_cents)}` : ''}{!i.show_residents ? ` · ${t('hidden from residents')}` : ''}</p>
            {i.description && <p className="mt-1 text-sm">{i.description}</p>}
            {canWrite && i.status !== 'done' && i.status !== 'cancelled' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.status === 'open' && <button type="button" onClick={() => set(i, { status: 'in_progress' })} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10">{t('In progress')}</button>}
                <button type="button" onClick={() => set(i, { status: 'done' })} className="rounded-lg bg-ok/10 px-2.5 py-1 text-xs font-semibold text-ok">{t('Done')}</button>
                <button type="button" onClick={() => cost(i)} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10">{t('Cost')}</button>
                <button type="button" onClick={() => set(i, { show_residents: !i.show_residents })} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10">{i.show_residents ? t('Hide from residents') : t('Show to residents')}</button>
                <button type="button" onClick={() => set(i, { status: 'cancelled' })} className="text-xs font-semibold text-muted">{t('Cancel')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 9c: announcements
type Announcement = { id: string; title: string; body: string | null; created_at: string };

export function AnnouncementsTab({ office, residence, lots, owners }: { office: Office; residence: Residence; lots: Lot[]; owners: Map<string, Owner> }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<Announcement[]>([]);
  const [f, setF] = useState({ title: '', body: '' });
  const [sending, setSending] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.from('residence_announcements').select('id, title, body, created_at').eq('residence_id', residence.id).order('created_at', { ascending: false });
    setRows((r.data ?? []) as Announcement[]);
  }, [residence.id]);
  useEffect(() => { load(); }, [load]);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return;
    const r = await supabase.from('residence_announcements').insert({ org_id: office.id, residence_id: residence.id, title: f.title.trim(), body: f.body.trim() || null }).select('id, title, body, created_at').single();
    if (r.error) { setError(err(r.error.message)); return; }
    setF({ title: '', body: '' }); load(); setSending(r.data as Announcement);
  };
  const del = async (a: Announcement) => { if (!window.confirm(t('Remove this announcement?'))) return; await supabase.from('residence_announcements').delete().eq('id', a.id); load(); };
  const withOwner = lots.filter(l => l.owner_person_id && owners.get(l.owner_person_id));

  return (
    <div className="mt-4 space-y-3">
      {canWrite && (
        <form onSubmit={add} className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={200} placeholder={t('Title, for example: water cut on Tuesday')} />
          <textarea className={inputCls} rows={3} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} maxLength={3000} placeholder={t('Message to the residents')} />
          <div className="flex justify-end"><Btn tone="brand" type="submit"><Megaphone className="h-4 w-4" /> {t('Publish')}</Btn></div>
          <p className="text-xs text-muted">{t('Published announcements appear on the residents page. You can also send them one by one on WhatsApp.')}</p>
        </form>
      )}
      {rows.map(a => (
        <div key={a.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{a.title} <span className="text-xs font-normal text-muted">· {day(a.created_at)}</span></p>
            {canWrite && <span className="flex gap-1"><button type="button" onClick={() => setSending(a)} aria-label={t('Send on WhatsApp')} className="grid h-7 w-7 place-items-center rounded-lg text-ok"><MessageCircle className="h-4 w-4" /></button>
              <button type="button" onClick={() => del(a)} aria-label={t('Remove')} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button></span>}
          </div>
          {a.body && <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>}
        </div>
      ))}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {sending && (
        <Modal title={t('Send to the co-owners')} onClose={() => setSending(null)} footer={<div className="flex justify-end"><Btn tone="brand" onClick={() => setSending(null)}>{t('Close')}</Btn></div>}>
          <p className="mb-2 text-sm text-muted">{t('Tap each name: WhatsApp opens with the message ready.')}</p>
          <ul className="space-y-1.5">
            {withOwner.map(l => { const o = owners.get(l.owner_person_id!)!; return (
              <li key={l.id}><button type="button" onClick={() => openWa(o, `${residence.name}\n${sending.title}${sending.body ? `\n\n${sending.body}` : ''}\n— ${office.name}`)}
                className="flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm hover:ring-2 hover:ring-brand/25"><span><span className="font-semibold">{l.label}</span> · {o.full_name}</span><MessageCircle className="h-4 w-4 text-ok" /></button></li>
            ); })}
            {withOwner.length === 0 && <p className="text-sm text-muted">{t('No co-owners with a number yet.')}</p>}
          </ul>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 9d: general meetings
type Assembly = { id: string; title: string; held_at: string; place: string | null; status: 'planned' | 'held' | 'cancelled'; notes: string | null };
type Resolution = { id: string; position: number; text: string; majority: 'simple' | 'absolute' | 'three_quarters' };
type Presence = { lot_id: string; presence: 'present' | 'represented' | 'absent'; proxy_name: string | null };
type Vote = { resolution_id: string; lot_id: string; vote: 'for' | 'against' | 'abstain' };
const MAJ: Record<Resolution['majority'], string> = { simple: 'Simple majority of votes cast', absolute: 'Absolute majority (more than half of all tantièmes)', three_quarters: 'Three quarters of all tantièmes' };
const MAJ_FR: Record<Resolution['majority'], string> = { simple: 'majorité simple des voix exprimées', absolute: 'majorité absolue des tantièmes', three_quarters: 'trois quarts des tantièmes' };

function result(res: Resolution, votes: Vote[], tant: Map<string, number>, total: number) {
  const sum = (v: Vote['vote']) => votes.filter(x => x.resolution_id === res.id && x.vote === v).reduce((s, x) => s + (tant.get(x.lot_id) ?? 0), 0);
  const pour = sum('for'), contre = sum('against'), abst = sum('abstain');
  const adopted = res.majority === 'simple' ? pour > contre : res.majority === 'absolute' ? pour > total / 2 : pour >= total * 0.75;
  return { pour, contre, abst, adopted };
}

function AssemblyView({ office, residence, lots, owners, assembly, onClose, onChanged }: {
  office: Office; residence: Residence; lots: Lot[]; owners: Map<string, Owner>; assembly: Assembly; onClose: () => void; onChanged: () => void;
}) {
  const canWrite = office.role !== 'viewer';
  const [res, setRes] = useState<Resolution[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [text, setText] = useState('');
  const [maj, setMaj] = useState<Resolution['majority']>('simple');
  const [convoke, setConvoke] = useState(false);
  const [pv, setPv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = assembly.status !== 'planned' || !canWrite;
  const tant = useMemo(() => new Map(lots.map(l => [l.id, Number(l.tantiemes)])), [lots]);
  const total = lots.reduce((s, l) => s + Number(l.tantiemes), 0);

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase.from('assembly_resolutions').select('id, position, text, majority').eq('assembly_id', assembly.id).order('position'),
      supabase.from('assembly_presence').select('lot_id, presence, proxy_name').eq('assembly_id', assembly.id),
    ]);
    const rs = (r.data ?? []) as Resolution[];
    setRes(rs); setPresence((p.data ?? []) as Presence[]);
    const v = rs.length ? await supabase.from('assembly_votes').select('resolution_id, lot_id, vote').in('resolution_id', rs.map(x => x.id)) : { data: [] };
    setVotes((v.data ?? []) as Vote[]);
  }, [assembly.id]);
  useEffect(() => { load(); }, [load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const r = await p; if (r.error) setError(err(r.error.message)); else { setError(null); load(); } };
  const addRes = () => { if (text.trim().length < 2) return; run(supabase.from('assembly_resolutions').insert({ org_id: office.id, assembly_id: assembly.id, position: (res.at(-1)?.position ?? 0) + 1, text: text.trim(), majority: maj })); setText(''); };
  const setPres = (lot: string, p: Presence['presence']) => run(supabase.from('assembly_presence').upsert({ org_id: office.id, assembly_id: assembly.id, lot_id: lot, presence: p }));
  const setProxy = (lot: string, name: string) => run(supabase.from('assembly_presence').upsert({ org_id: office.id, assembly_id: assembly.id, lot_id: lot, presence: 'represented', proxy_name: name.trim() || null }));
  const setVote = (r: string, lot: string, v: Vote['vote']) => run(supabase.from('assembly_votes').upsert({ org_id: office.id, resolution_id: r, lot_id: lot, vote: v }));
  const close = async () => {
    if (!window.confirm(t('Close the general meeting? Attendance and votes are then fixed.'))) return;
    const r = await supabase.from('assemblies').update({ status: 'held' }).eq('id', assembly.id).select('id');
    if (r.error) setError(err(r.error.message)); else onChanged();
  };
  const voters = lots.filter(l => { const p = presence.find(x => x.lot_id === l.id)?.presence; return p === 'present' || p === 'represented'; });
  const presentTant = voters.reduce((s, l) => s + Number(l.tantiemes), 0);
  const agendaText = res.map(r => `${r.position}. ${r.text}`).join('\n');

  if (pv) return <PvDoc office={office} residence={residence} lots={lots} owners={owners} assembly={assembly} res={res} presence={presence} votes={votes} tant={tant} total={total} onClose={() => setPv(false)} />;

  return createPortal((
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="night flex items-center justify-between gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0"><p className="truncate font-display text-lg font-bold">{assembly.title}</p><p className="truncate text-xs text-white/70">{residence.name} · {when(assembly.held_at)}</p></div>
        <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4 pb-24">
          <section>
            <h3 className="text-sm font-semibold">{t('Agenda of the meeting')}</h3>
            <ol className="mt-2 space-y-1.5">
              {res.map(r => (
                <li key={r.id} className="flex items-start justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span><span className="font-semibold">{r.position}.</span> {r.text} <span className="block text-xs text-muted">{t(MAJ[r.majority])}</span></span>
                  {!locked && <button type="button" onClick={() => run(supabase.from('assembly_resolutions').delete().eq('id', r.id))} aria-label={t('Remove')} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ol>
            {!locked && (
              <div className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3">
                <input className={inputCls} value={text} onChange={e => setText(e.target.value)} maxLength={1000} placeholder={t('Resolution, for example: approval of the 2026 accounts')} />
                <select className={inputCls} value={maj} onChange={e => setMaj(e.target.value as Resolution['majority'])}>
                  {(['simple', 'absolute', 'three_quarters'] as const).map(m => <option key={m} value={m}>{t(MAJ[m])}</option>)}
                </select>
                <div className="flex justify-end"><Btn onClick={addRes}><Plus className="h-4 w-4" /> {t('Add to the agenda')}</Btn></div>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t('Attendance')} <span className="font-normal text-muted">· {t('{p} of {t} tantièmes present or represented', { p: presentTant, t: total })}</span></h3>
            <ul className="mt-2 space-y-1">
              {lots.map(l => { const cur = presence.find(x => x.lot_id === l.id)?.presence; const o = l.owner_person_id ? owners.get(l.owner_person_id) : undefined; return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                  <span><span className="font-semibold">{l.label}</span> <span className="text-xs text-muted">· {o?.full_name ?? '—'} · {Number(l.tantiemes)}</span></span>
                  <span className="flex gap-1">{(['present', 'represented', 'absent'] as const).map(p => (
                    <button key={p} type="button" disabled={locked} aria-pressed={cur === p} onClick={() => setPres(l.id, p)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cur === p ? (p === 'absent' ? 'bg-ink/70 text-white' : 'bg-ok text-white') : 'bg-surface text-muted ring-1 ring-line/10'}`}>
                      {t(({ present: 'Present', represented: 'Represented', absent: 'Absent' } as const)[p])}</button>))}</span>
                  {cur === 'represented' && (locked
                    ? <span className="w-full text-xs text-muted">{presence.find(x => x.lot_id === l.id)?.proxy_name ? t('Represented by {name}', { name: presence.find(x => x.lot_id === l.id)!.proxy_name! }) : ''}</span>
                    : <input key={presence.find(x => x.lot_id === l.id)?.proxy_name ?? ''} defaultValue={presence.find(x => x.lot_id === l.id)?.proxy_name ?? ''} onBlur={e => e.target.value !== (presence.find(x => x.lot_id === l.id)?.proxy_name ?? '') && setProxy(l.id, e.target.value)}
                        maxLength={200} placeholder={t('Represented by (name)')} className="w-full rounded-lg border border-line/[0.12] bg-surface px-2.5 py-1 text-xs outline-none focus:border-brand" />)}
                </li>); })}
            </ul>
          </section>

          {res.map(r => { const x = result(r, votes, tant, total); return (
            <section key={r.id} className="card rounded-2xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{r.position}. {r.text}</p>
                {(x.pour + x.contre + x.abst) > 0 && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${x.adopted ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>{x.adopted ? t('Adopted') : t('Rejected')}</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{t('For {a} · against {b} · abstain {c} (tantièmes)', { a: x.pour, b: x.contre, c: x.abst })}</p>
              {voters.length === 0 ? <p className="mt-2 text-xs text-muted">{t('Mark who is present or represented to record the votes.')}</p> : (
                <ul className="mt-2 space-y-1">
                  {voters.map(l => { const cur = votes.find(v => v.resolution_id === r.id && v.lot_id === l.id)?.vote; return (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{l.label}</span>
                      <span className="flex gap-1">{(['for', 'against', 'abstain'] as const).map(v => (
                        <button key={v} type="button" disabled={locked} aria-pressed={cur === v} onClick={() => setVote(r.id, l.id, v)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cur === v ? (v === 'for' ? 'bg-ok text-white' : v === 'against' ? 'bg-danger text-white' : 'bg-ink/70 text-white') : 'bg-surface text-muted ring-1 ring-line/10'}`}>
                          {t(({ for: 'For', against: 'Against', abstain: 'Abstain' } as const)[v])}</button>))}</span>
                    </li>); })}
                </ul>
              )}
            </section>); })}
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        </div>
      </div>
      <div className="border-t border-line/10 bg-surface px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl flex-wrap justify-end gap-2">
          {assembly.status === 'planned' && canWrite && <Btn tone="ghost" onClick={() => setConvoke(true)}><MessageCircle className="h-4 w-4" /> {t('Convocation')}</Btn>}
          <Btn tone="ghost" onClick={() => setPv(true)}><Printer className="h-4 w-4" /> {t('Minutes (PV)')}</Btn>
          {assembly.status === 'planned' && canWrite && <Btn tone="brand" onClick={close}><Gavel className="h-4 w-4" /> {t('Close the meeting')}</Btn>}
        </div>
      </div>
      {convoke && (
        <Modal title={t('Convocation')} onClose={() => setConvoke(false)} footer={<div className="flex justify-end"><Btn tone="brand" onClick={() => setConvoke(false)}>{t('Close')}</Btn></div>}>
          <p className="mb-2 text-sm text-muted">{t('Tap each name: WhatsApp opens with the invitation and the agenda.')}</p>
          <ul className="space-y-1.5">
            {lots.filter(l => l.owner_person_id && owners.get(l.owner_person_id)).map(l => { const o = owners.get(l.owner_person_id!)!; return (
              <li key={l.id}><button type="button" onClick={() => openWa(o, `Bonjour ${o.full_name.split(/\s+/)[0]},\nVous êtes convoqué(e) à l'${assembly.title.toLowerCase()} de la ${residence.name}, le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(assembly.held_at))}${assembly.place ? `, ${assembly.place}` : ''}.\n\nOrdre du jour :\n${agendaText || '-'}\n\nSi vous ne pouvez pas venir, vous pouvez vous faire représenter.\n— ${office.name}, syndic`)}
                className="flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm hover:ring-2 hover:ring-brand/25"><span><span className="font-semibold">{l.label}</span> · {o.full_name}</span><MessageCircle className="h-4 w-4 text-ok" /></button></li>); })}
          </ul>
        </Modal>
      )}
    </div>
  ), document.body);
}

function PvDoc({ office, residence, lots, owners, assembly, res, presence, votes, tant, total, onClose }: {
  office: Office; residence: Residence; lots: Lot[]; owners: Map<string, Owner>; assembly: Assembly; res: Resolution[]; presence: Presence[]; votes: Vote[];
  tant: Map<string, number>; total: number; onClose: () => void;
}) {
  const present = lots.filter(l => presence.find(p => p.lot_id === l.id)?.presence === 'present');
  const repr = lots.filter(l => presence.find(p => p.lot_id === l.id)?.presence === 'represented');
  const pt = [...present, ...repr].reduce((s, l) => s + Number(l.tantiemes), 0);
  const name = (l: Lot) => `${l.label}${l.owner_person_id && owners.get(l.owner_person_id) ? ` (${owners.get(l.owner_person_id)!.full_name})` : ''}`;
  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-3xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir="ltr" lang="fr">
        <div className="no-print mb-5 flex items-center justify-between gap-2">
          <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <div className="text-[13px] leading-relaxed">
          <p className="text-center text-xl font-black uppercase tracking-wide">Procès-verbal</p>
          <p className="text-center font-semibold">{assembly.title} · {residence.name}</p>
          <p className="mt-4">Le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(assembly.held_at))}{assembly.place ? `, ${assembly.place}` : ''}, les copropriétaires de la {residence.name}{residence.address ? `, ${residence.address}` : ''}{residence.city ? `, ${residence.city}` : ''} se sont réunis en assemblée générale sur convocation du syndic, {office.name}.</p>
          <p className="mt-3"><span className="font-semibold">Présents</span> ({present.length}) : {present.map(name).join(', ') || '—'}</p>
          <p><span className="font-semibold">Représentés</span> ({repr.length}) : {repr.map(l => { const px = presence.find(p => p.lot_id === l.id)?.proxy_name; return px ? `${name(l)} par ${px}` : name(l); }).join(', ') || '—'}</p>
          <p>Soit {pt} tantièmes sur {total} ({total ? Math.round(pt / total * 100) : 0} %).</p>
          {res.map(r => { const x = result(r, votes, tant, total); return (
            <div key={r.id} className="mt-4 break-inside-avoid">
              <p className="font-semibold">Résolution n° {r.position} : {r.text}</p>
              <p>Vote à la {MAJ_FR[r.majority]}. Pour : {x.pour} · Contre : {x.contre} · Abstention : {x.abst} (tantièmes).</p>
              <p className="font-semibold">{x.adopted ? 'Résolution adoptée.' : 'Résolution rejetée.'}</p>
            </div>); })}
          {assembly.notes && <p className="mt-4 whitespace-pre-line">{assembly.notes}</p>}
          <p className="mt-5">L'ordre du jour étant épuisé, la séance est levée.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {['Le président de séance', 'Le syndic'].map(x => <div key={x} className="h-24 rounded-lg border border-black/15 p-3 text-[11px] font-bold uppercase text-black/60">{x}</div>)}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

export function AssembliesTab({ office, residence, lots, owners }: { office: Office; residence: Residence; lots: Lot[]; owners: Map<string, Owner> }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<Assembly[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: 'Assemblée générale ordinaire', at: '', place: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.from('assemblies').select('id, title, held_at, place, status, notes').eq('residence_id', residence.id).order('held_at', { ascending: false });
    setRows((r.data ?? []) as Assembly[]);
  }, [residence.id]);
  useEffect(() => { load(); }, [load]);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.at) { setError(t('Choose the date and time.')); return; }
    const r = await supabase.from('assemblies').insert({ org_id: office.id, residence_id: residence.id, title: f.title.trim() || 'Assemblée générale', held_at: new Date(f.at).toISOString(), place: f.place.trim() || null }).select('id').single();
    if (r.error) { setError(err(r.error.message)); return; }
    setAdding(false); await load(); setOpenId((r.data as { id: string }).id);
  };
  const opened = rows.find(r => r.id === openId);
  return (
    <div className="mt-4">
      {canWrite && !adding && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Plan a general meeting')}</Btn>}
      {adding && (
        <form onSubmit={add} className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <Field label={t('Title')}><input className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={200} /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('Date and time')}><input type="datetime-local" className={inputCls} value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></Field>
            <Field label={t('Place')}><input className={inputCls} value={f.place} onChange={e => setF({ ...f, place: e.target.value })} maxLength={300} placeholder="Hall de la résidence" /></Field>
          </div>
          <div className="flex justify-end gap-2"><Btn type="button" onClick={() => setAdding(false)}>{t('Cancel')}</Btn><Btn tone="brand" type="submit">{t('Save')}</Btn></div>
        </form>
      )}
      {rows.length === 0 && !adding && <p className="mt-6 text-center text-sm text-muted">{t('No general meetings yet.')}</p>}
      <ul className="mt-3 space-y-2">
        {rows.map(a => (
          <li key={a.id}><button type="button" onClick={() => setOpenId(a.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-start text-sm hover:ring-2 hover:ring-brand/25">
            <span><span className="font-semibold">{a.title}</span><span className="block text-xs text-muted">{when(a.held_at)}{a.place ? ` · ${a.place}` : ''}</span></span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === 'held' ? 'bg-ok/10 text-ok' : a.status === 'planned' ? 'bg-brand/10 text-brand' : 'bg-surface text-muted'}`}>{t(({ planned: 'Planned', held: 'Held', cancelled: 'Cancelled' } as const)[a.status])}</span>
          </button></li>
        ))}
      </ul>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {opened && <AssemblyView office={office} residence={residence} lots={lots} owners={owners} assembly={opened} onClose={() => setOpenId(null)} onChanged={() => { load(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- 9e: resident link per lot
type RLink = { token: string; lang: 'fr' | 'ar' | 'en' | 'nl'; open_count: number };
const RMSG: Record<RLink['lang'], (n: string, r: string, u: string) => string> = {
  fr: (n, r, u) => `Bonjour ${n}, voici votre espace copropriétaire de la ${r} : vos charges, les annonces, les travaux et les assemblées générales.\n${u}\nCe lien est personnel.`,
  ar: (n, r, u) => `مرحبا ${n}، هذا فضاؤكم كمالك مشترك في ${r}: المساهمات والإعلانات والأشغال والجموع العامة.\n${u}\nهذا الرابط شخصي.`,
  en: (n, r, u) => `Hello ${n}, here is your co-owner page for ${r}: charges, announcements, works and general meetings.\n${u}\nThis link is personal.`,
  nl: (n, r, u) => `Hallo ${n}, hier is uw pagina als mede-eigenaar van ${r}: kosten, mededelingen, werkzaamheden en algemene vergaderingen.\n${u}\nDeze link is persoonlijk.`,
};

export function ResidentLink({ office, residence, lot, owner }: { office: Office; residence: Residence; lot: Lot; owner: Owner | undefined }) {
  const [link, setLink] = useState<RLink | null | undefined>(undefined);
  const [lang, setLang] = useState<RLink['lang']>('fr');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.from('resident_links').select('token, lang, open_count').eq('lot_id', lot.id).is('revoked_at', null).maybeSingle();
    setLink(r.error ? null : (r.data as RLink | null));
  }, [lot.id]);
  useEffect(() => { load(); }, [load]);
  if (link === undefined || !PUBLIC_SITE || office.role === 'viewer') return null;
  const url = (l: RLink) => `${PUBLIC_SITE}/r/${l.token}?lang=${l.lang}`;
  const create = async () => { const { error } = await supabase.rpc('create_resident_link', { p_lot: lot.id, p_lang: lang }); if (error) setError(planError(error.message)); else load(); };
  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> {t('Residents page')}</p>
      {link ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn tone="brand" onClick={() => openWa(owner, RMSG[link.lang]((owner?.full_name ?? '').split(/\s+/)[0] ?? '', residence.name, url(link)))}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')}</Btn>
          <Btn tone="ghost" onClick={async () => { try { await navigator.clipboard.writeText(url(link)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
          <Btn tone="ghost" onClick={async () => { await supabase.rpc('revoke_resident_link', { p_lot: lot.id }); load(); }}>{t('Stop link')}</Btn>
          <span className="self-center text-xs text-muted">{link.open_count ? t('Opened {n} times', { n: link.open_count }) : t('Not opened yet')}</span>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(['fr', 'ar', 'en', 'nl'] as const).map(x => <button key={x} type="button" aria-pressed={lang === x} onClick={() => setLang(x)} className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{x}</button>)}
          <Btn tone="brand" onClick={create} className="ms-auto">{t('Make a link')}</Btn>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

export const TabIcons = { incidents: Wrench, news: Megaphone, ag: Gavel };
