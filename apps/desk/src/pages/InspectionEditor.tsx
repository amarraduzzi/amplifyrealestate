import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, Plus, Printer, Save, Signature, Trash2, X } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import {
  CONDITIONS, ROOM_NAMES, addPhoto, conditionCls, loadPhotos, removePhoto, roomPreset, saveInspection, signInspection,
  type Condition, type InspPhoto, type Inspection,
} from '../lib/inspections';
import { planError } from '../lib/plan';
import { Btn, Field, inputCls } from '../components/ui';
import { SignaturePad } from '../components/SignaturePad';
import { InspectionDoc } from './InspectionDoc';

const condLabel = (c: Condition) => t(({ new: 'As new', good: 'Good', fair: 'Fair', poor: 'Poor' } as const)[c]);

function inspError(m: string) {
  if (m.includes('inspection_signed')) return t('This report has been signed and can no longer change.');
  if (m.includes('inspection_signatures_missing')) return t('Both signatures are needed.');
  return planError(m);
}

/** Fill in an état des lieux on the spot (phone or tablet), then let tenant and agent sign on the screen. */
export function InspectionEditor({ office, inspection, entry, property, tenant, onClose, onChanged }: {
  office: Office; inspection: Inspection; entry?: Inspection; property: { title: string; reference: string; address?: string | null }; tenant: string;
  onClose: () => void; onChanged: () => void;
}) {
  const [doc, setDoc] = useState<Inspection>(inspection);
  const [photos, setPhotos] = useState<InspPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<number | null>(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [sig, setSig] = useState<{ tenant: string | null; agent: string | null; tenantName: string; agentName: string }>({ tenant: null, agent: null, tenantName: tenant, agentName: '' });
  const [printing, setPrinting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRoom = useRef(0);
  const locked = doc.status === 'signed' || office.role === 'viewer';

  const loadP = useCallback(async () => { const r = await loadPhotos(doc.id); setPhotos(r.photos); setUrls(r.urls); }, [doc.id]);
  useEffect(() => { loadP(); }, [loadP]);

  const change = (fn: (d: Inspection) => Inspection) => { if (locked) return; setDoc(d => fn(structuredClone(d))); setDirty(true); };
  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    setBusy('save'); setError(null);
    const err = await saveInspection(doc);
    setBusy(null);
    if (err) { setError(inspError(err)); return false; }
    setDirty(false); onChanged(); return true;
  };
  const close = async () => { if (dirty && !(await save())) return; onClose(); };

  const pickPhoto = (room: number) => { photoRoom.current = room; fileRef.current?.click(); };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('photo'); setError(null);
    try { for (const f of Array.from(files).slice(0, 10)) await addPhoto(office.id, doc.id, photoRoom.current, f); }
    catch (e) { setError(inspError(e instanceof Error ? e.message : String(e))); }
    if (fileRef.current) fileRef.current.value = '';
    setBusy(null); loadP();
  };
  const dropPhoto = async (p: InspPhoto) => { const err = await removePhoto(p); if (err) setError(inspError(err)); else loadP(); };

  const sign = async () => {
    if (!sig.tenant || !sig.agent) { setError(t('Both signatures are needed.')); return; }
    if (!(await save())) return;
    setBusy('sign'); setError(null);
    const err = await signInspection(doc.id, sig.tenantName, sig.tenant, sig.agentName, sig.agent);
    setBusy(null);
    if (err) { setError(inspError(err)); return; }
    setDoc(d => ({ ...d, status: 'signed', tenant_name: sig.tenantName, agent_name: sig.agentName, tenant_signature: sig.tenant, agent_signature: sig.agent, signed_at: new Date().toISOString() }));
    setSigning(false); onChanged();
  };

  const entryOf = (room: string, label: string) => entry?.rooms.find(r => r.name === room)?.items.find(i => i.label === label)?.condition ?? null;
  const title = doc.kind === 'entry' ? t('Check-in report') : t('Check-out report');

  if (printing) return <InspectionDoc office={office} inspection={doc} entry={entry} photos={photos} urls={urls} property={property} tenant={tenant} onClose={() => setPrinting(false)} />;

  return createPortal((
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="night flex items-center justify-between gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{title}</p>
          <p className="truncate text-xs text-white/70">{property.title} · {tenant}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {doc.status === 'signed' && <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">{t('Signed')}</span>}
          <button onClick={close} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 pb-28">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="col-span-3 sm:col-span-1"><Field label={t('Date')}><input type="date" disabled={locked} className={inputCls} value={doc.inspected_on} onChange={e => change(d => ({ ...d, inspected_on: e.target.value }))} /></Field></div>
            {(['water', 'electricity', 'gas'] as const).map(m => (
              <Field key={m} label={t(m === 'water' ? 'Water' : m === 'electricity' ? 'Electricity' : 'Gas')}>
                <input disabled={locked} className={inputCls} dir="ltr" inputMode="decimal" value={doc.meters[m] ?? ''} onChange={e => change(d => ({ ...d, meters: { ...d.meters, [m]: e.target.value } }))} />
              </Field>
            ))}
          </div>

          {doc.rooms.map((r, ri) => {
            const rp = photos.filter(p => p.room === ri);
            const filled = r.items.filter(i => i.condition).length;
            return (
              <section key={ri} className="card overflow-hidden rounded-2xl">
                <button type="button" onClick={() => setOpen(o => (o === ri ? null : ri))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
                  <span className="font-display font-semibold">{r.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">{filled}/{r.items.length}{rp.length ? ` · ${rp.length} 📷` : ''}<ChevronDown className={`h-4 w-4 transition ${open === ri ? 'rotate-180' : ''}`} /></span>
                </button>
                {open === ri && (
                  <div className="space-y-3 border-t border-line/[0.07] px-4 py-3">
                    {!locked && <input className={inputCls} value={r.name} onChange={e => change(d => { d.rooms[ri].name = e.target.value; return d; })} aria-label={t('Name of the room')} maxLength={60} />}
                    {r.items.map((it, ii) => {
                      const before = doc.kind === 'exit' ? entryOf(r.name, it.label) : null;
                      return (
                        <div key={ii} className="rounded-xl bg-surface-2 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            {locked ? <span className="text-sm font-semibold">{it.label}</span>
                              : <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" value={it.label} maxLength={80} aria-label={t('Item')}
                                  onChange={e => change(d => { d.rooms[ri].items[ii].label = e.target.value; return d; })} />}
                            {!locked && <button type="button" onClick={() => change(d => { d.rooms[ri].items.splice(ii, 1); return d; })} aria-label={t('Remove')} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                          {before && <p className="mt-0.5 text-[11px] text-muted">{t('At check-in: {state}', { state: condLabel(before) })}</p>}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {CONDITIONS.map(c => (
                              <button key={c} type="button" disabled={locked} aria-pressed={it.condition === c} onClick={() => change(d => { d.rooms[ri].items[ii].condition = d.rooms[ri].items[ii].condition === c ? null : c; return d; })}
                                className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${it.condition === c ? conditionCls[c] + ' ring-1 ring-current' : 'bg-surface text-muted ring-1 ring-line/10'} disabled:cursor-default`}>
                                {condLabel(c)}
                              </button>
                            ))}
                          </div>
                          {(!locked || it.note) && (
                            <input disabled={locked} className="mt-1.5 w-full rounded-lg bg-surface px-2.5 py-1.5 text-sm outline-none ring-1 ring-line/10 focus:ring-brand" placeholder={t('Remark (optional)')}
                              value={it.note} maxLength={300} onChange={e => change(d => { d.rooms[ri].items[ii].note = e.target.value; return d; })} />
                          )}
                        </div>
                      );
                    })}
                    {!locked && <button type="button" onClick={() => change(d => { d.rooms[ri].items.push({ label: '', condition: null, note: '' }); return d; })} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><Plus className="h-4 w-4" /> {t('Add an item')}</button>}

                    <div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {rp.map(p => (
                          <div key={p.id} className="relative">
                            {urls[p.id] ? <img src={urls[p.id]} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-xl bg-surface-3" />}
                            {!locked && <button type="button" onClick={() => dropPhoto(p)} aria-label={t('Remove')} className="absolute end-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>}
                          </div>
                        ))}
                      </div>
                      {!locked && <Btn tone="ghost" className="mt-2" disabled={busy === 'photo'} onClick={() => pickPhoto(ri)}><Camera className="h-4 w-4" /> {busy === 'photo' ? '…' : t('Add photos')}</Btn>}
                    </div>
                    {!locked && <button type="button" onClick={() => { if (window.confirm(t('Remove this room?'))) change(d => { d.rooms.splice(ri, 1); return d; }); }} className="text-xs font-semibold text-danger">{t('Remove this room')}</button>}
                  </div>
                )}
              </section>
            );
          })}

          {!locked && doc.rooms.length < 30 && (
            <select className={inputCls} value="" onChange={e => { const v = e.target.value; if (!v) return; change(d => { d.rooms.push(roomPreset(v === '__other' ? t('New room') : v)); return d; }); setOpen(doc.rooms.length); }}>
              <option value="">{t('+ Add a room')}</option>
              {ROOM_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              <option value="__other">{t('Other room')}</option>
            </select>
          )}

          <Field label={t('Keys handed over')}><input disabled={locked} className={inputCls} value={doc.keys_note ?? ''} maxLength={500} placeholder="2 clés porte, 1 badge, 1 clé boîte aux lettres" onChange={e => change(d => ({ ...d, keys_note: e.target.value }))} /></Field>
          <Field label={t('General remarks')}><textarea disabled={locked} className={inputCls} rows={3} value={doc.general_note ?? ''} maxLength={2000} onChange={e => change(d => ({ ...d, general_note: e.target.value }))} /></Field>

          {signing && !locked && (
            <div className="card space-y-4 rounded-2xl p-4">
              <p className="text-sm text-muted">{t('After signing, the report can no longer be changed. Check everything with the tenant first.')}</p>
              <Field label={t('Name of the tenant')}><input className={inputCls} value={sig.tenantName} onChange={e => setSig({ ...sig, tenantName: e.target.value })} /></Field>
              <SignaturePad label={t('Signature of the tenant')} onChange={png => setSig(s => ({ ...s, tenant: png }))} />
              <Field label={t('Name of the agent')}><input className={inputCls} value={sig.agentName} onChange={e => setSig({ ...sig, agentName: e.target.value })} placeholder={office.name} /></Field>
              <SignaturePad label={t('Signature for the agency')} onChange={png => setSig(s => ({ ...s, agent: png }))} />
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setSigning(false)}>{t('Cancel')}</Btn>
                <Btn tone="brand" disabled={busy !== null || !sig.tenant || !sig.agent} onClick={sign}><Signature className="h-4 w-4" /> {t('Sign and lock')}</Btn>
              </div>
            </div>
          )}
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        </div>
      </div>

      <div className="border-t border-line/10 bg-surface px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
          <Btn tone="ghost" onClick={async () => { if (await save()) setPrinting(true); }}><Printer className="h-4 w-4" /> {t('Print or PDF')}</Btn>
          {!locked && <Btn disabled={busy !== null || !dirty} onClick={save}><Save className="h-4 w-4" /> {dirty ? t('Save') : t('Saved')}</Btn>}
          {!locked && !signing && <Btn tone="brand" onClick={() => { setSigning(true); setOpen(null); }}><Signature className="h-4 w-4" /> {t('Sign')}</Btn>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
    </div>
  ), document.body);
}
