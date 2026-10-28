import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, Check, Download, HardHat, Layers, MessageCircle, MousePointerClick, Plus, Trash2, X } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import {
  PROJECT_STATUSES, UNIT_CLS, UNIT_KINDS, UNIT_STATUSES, floorLabel, loadProject, loadProjects, projectError, projectStatusLabel, seriesRef,
  loadSales, saleError, unitKindLabel, unitStatusLabel, type Buyer, type Sale, type Project, type ProjectStatus, type Tranche, type Unit, type UnitKind, type UnitStatus,
} from '../lib/projects';
import { planError } from '../lib/plan';
import { downloadCsv, toCsv } from '../lib/exportCsv';
import { Btn, Card, Field, Modal, inputCls } from '../components/ui';
import { ProjectMarketing } from './ProjectMarketing';
import { ProjectReport } from './ProjectReport';
import { SaleForm, SaleView, SalesTab, WorksPanel, type SaleData } from './DevSales';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const err = (m: string) => { const x = projectError(m) ?? saleError(m); return x ? t(x) : planError(m); };
const num = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
const int = (s: string) => { const v = Number.parseInt(s, 10); return Number.isFinite(v) ? v : null; };
const perM2 = (u: Unit) => (u.price_cents && u.area_m2 ? Math.round(u.price_cents / u.area_m2) : null);

function stats(units: Unit[]) {
  const by = (s: UnitStatus) => units.filter(u => u.status === s);
  const sold = by('sold');
  const open = units.filter(u => u.status === 'available' || u.status === 'option');
  return {
    total: units.length, available: by('available').length, option: by('option').length, reserved: by('reserved').length, sold: sold.length,
    soldCents: sold.reduce((s, u) => s + (u.price_cents ?? 0), 0),
    reservedCents: by('reserved').reduce((s, u) => s + (u.price_cents ?? 0), 0),
    stockCents: open.reduce((s, u) => s + (u.price_cents ?? 0), 0),
  };
}

// ---------------------------------------------------------------- forms
function ProjectForm({ office, project, onClose, onSaved }: { office: Office; project?: Project; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: project?.name ?? '', city: project?.city ?? office.city ?? '', address: project?.address ?? '', description: project?.description ?? '', status: (project?.status ?? 'selling') as ProjectStatus, delivery: project?.delivery_date ?? '' });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) { setError(t('Enter the name of the project.')); return; }
    const row = { name: f.name.trim(), city: f.city.trim() || null, address: f.address.trim() || null, description: f.description.trim() || null, status: f.status, delivery_date: f.delivery || null };
    const r = project ? await supabase.from('dev_projects').update(row).eq('id', project.id).select('id').single() : await supabase.from('dev_projects').insert({ ...row, org_id: office.id }).select('id').single();
    if (r.error) { setError(err(r.error.message)); return; }
    onSaved((r.data as { id: string }).id);
  };
  const archive = async () => {
    if (!project || !window.confirm(t('Archive this project? It disappears from the list.'))) return;
    const r = await supabase.from('dev_projects').update({ archived: true }).eq('id', project.id).select('id');
    if (r.error) setError(err(r.error.message)); else onSaved('');
  };
  return (
    <Modal title={project ? project.name : t('New project')} onClose={onClose}
      footer={<div className="flex justify-between gap-2">{project ? <Btn tone="ghost" onClick={archive}>{t('Archive')}</Btn> : <span />}<span className="flex gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="project-form">{t('Save')}</Btn></span></div>}>
      <form id="project-form" onSubmit={save} className="space-y-3">
        <Field label={t('Name of the project')}><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={200} placeholder="Les Jardins de Harhoura" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('City')}><input className={inputCls} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} maxLength={100} /></Field>
          <Field label={t('Expected delivery')}><input type="date" className={inputCls} value={f.delivery} onChange={e => setF({ ...f, delivery: e.target.value })} /></Field>
        </div>
        <Field label={t('Address')}><input className={inputCls} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} maxLength={300} /></Field>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_STATUSES.map(s => <button key={s} type="button" aria-pressed={f.status === s} onClick={() => setF({ ...f, status: s })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.status === s ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{projectStatusLabel(s)}</button>)}
        </div>
        <Field label={t('Description')}><textarea className={inputCls} rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={5000} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function SeriesForm({ project, tranches, onClose, onSaved }: { project: Project; tranches: Tranche[]; onClose: () => void; onSaved: (n: number) => void }) {
  const [f, setF] = useState({ building: 'A', from: '0', to: '4', per: '4', kind: 'apartment' as UnitKind, bedrooms: '', area: '', price: '', tranche: tranches[0]?.id ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = int(f.from), to = int(f.to), per = int(f.per);
  const count = from !== null && to !== null && per !== null && to >= from && per > 0 ? (to - from + 1) * per : 0;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!count) { setError(t('Check the floors and the number of units per floor.')); return; }
    setBusy(true);
    const price = num(f.price);
    const { data, error } = await supabase.rpc('add_dev_units', {
      p_project: project.id, p_tranche: f.tranche || null, p_building: f.building, p_floor_from: from, p_floor_to: to, p_per_floor: per,
      p_kind: f.kind, p_bedrooms: int(f.bedrooms), p_area: num(f.area), p_price_cents: price ? dirhamToCents(price) : null,
    });
    setBusy(false);
    if (error) { setError(err(error.message)); return; }
    onSaved(Number(data));
  };
  return (
    <Modal title={t('Add units')} onClose={onClose}
      footer={<div className="flex items-center justify-between gap-2"><span className="text-sm text-muted">{t('{n} units', { n: count })}</span><span className="flex gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="series-form" disabled={busy || !count}>{t('Add')}</Btn></span></div>}>
      <form id="series-form" onSubmit={save} className="space-y-3">
        <p className="text-sm text-muted">{t('Make a whole building at once. You can change each unit afterwards.')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('Building')}><input className={inputCls} value={f.building} onChange={e => setF({ ...f, building: e.target.value })} maxLength={20} /></Field>
          <Field label={t('From floor')} hint={t('0 = ground floor')}><input className={inputCls} inputMode="numeric" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
          <Field label={t('To floor')}><input className={inputCls} inputMode="numeric" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
          <Field label={t('Units per floor')}><input className={inputCls} inputMode="numeric" value={f.per} onChange={e => setF({ ...f, per: e.target.value })} /></Field>
        </div>
        {count > 0 && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{t('References: {a}, {b} … {c}', { a: seriesRef(f.building, from!, 1), b: seriesRef(f.building, from!, Math.min(2, per!)), c: seriesRef(f.building, to!, per!) })}</p>}
        <div className="flex flex-wrap gap-1.5">
          {UNIT_KINDS.map(k => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.kind === k ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{unitKindLabel(k)}</button>)}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Bedrooms')}><input className={inputCls} inputMode="numeric" value={f.bedrooms} onChange={e => setF({ ...f, bedrooms: e.target.value })} /></Field>
          <Field label={t('Area (m²)')}><input className={inputCls} inputMode="decimal" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} /></Field>
          <Field label={t('Price (DH)')}><input className={inputCls} inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field>
        </div>
        {tranches.length > 0 && (
          <Field label={t('Tranche')}><select className={inputCls} value={f.tranche} onChange={e => setF({ ...f, tranche: e.target.value })}>
            <option value="">{t('No tranche')}</option>{tranches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></Field>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function UnitForm({ office, project, tranches, unit, buyer, onClose, onSaved, onReserve }: { office: Office; project: Project; tranches: Tranche[]; unit?: Unit; buyer?: Buyer; onClose: () => void; onSaved: () => void; onReserve?: () => void }) {
  const [f, setF] = useState({
    reference: unit?.reference ?? '', kind: (unit?.kind ?? 'apartment') as UnitKind, building: unit?.building ?? '', floor: unit?.floor === null || unit?.floor === undefined ? '' : String(unit.floor),
    bedrooms: unit?.bedrooms === null || unit?.bedrooms === undefined ? '' : String(unit.bedrooms), area: unit?.area_m2 ? String(unit.area_m2) : '', terrace: unit?.terrace_m2 ? String(unit.terrace_m2) : '',
    price: unit?.price_cents ? String(unit.price_cents / 100) : '', status: (unit?.status ?? 'available') as UnitStatus, tranche: unit?.tranche_id ?? '', notes: unit?.notes ?? '',
    buyerName: buyer?.buyer_name ?? '', buyerPhone: buyer?.buyer_phone ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const needsBuyer = f.status === 'option' || f.status === 'reserved' || f.status === 'sold';
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.reference.trim()) { setError(t('Enter the reference of the unit, for example A-101.')); return; }
    let buyerId: string | null = buyer?.buyer_person_id ?? null;
    const name = f.buyerName.trim();
    if (!needsBuyer || !name) buyerId = null;
    else if (!buyer || buyer.buyer_name !== name) {
      const p = await supabase.from('people').insert({ org_id: office.id, full_name: name, phone: f.buyerPhone.trim() || null, whatsapp: f.buyerPhone.trim() || null, notes: `Acquéreur ${project.name}` }).select('id').single();
      if (p.error) { setError(err(p.error.message)); return; }
      buyerId = (p.data as { id: string }).id;
    } else if ((buyer.buyer_phone ?? '') !== f.buyerPhone.trim()) {
      await supabase.from('people').update({ phone: f.buyerPhone.trim() || null, whatsapp: f.buyerPhone.trim() || null }).eq('id', buyer.buyer_person_id);
    }
    const price = num(f.price);
    const row = {
      reference: f.reference.trim(), kind: f.kind, building: f.building.trim() || null, floor: int(f.floor), bedrooms: int(f.bedrooms), area_m2: num(f.area), terrace_m2: num(f.terrace),
      price_cents: price ? dirhamToCents(price) : null, status: f.status, tranche_id: f.tranche || null, notes: f.notes.trim() || null, buyer_person_id: buyerId,
    };
    const r = unit ? await supabase.from('dev_units').update(row).eq('id', unit.id).select('id') : await supabase.from('dev_units').insert({ ...row, org_id: office.id, project_id: project.id }).select('id');
    if (r.error) { setError(err(r.error.message)); return; }
    onSaved();
  };
  const del = async () => {
    if (!unit || !window.confirm(t('Remove this unit?'))) return;
    const r = await supabase.from('dev_units').delete().eq('id', unit.id).select('id');
    if (r.error) setError(err(r.error.message)); else if (!r.data?.length) setError(t('A sold unit cannot be removed.')); else onSaved();
  };
  return (
    <Modal title={unit ? `${unit.reference} · ${project.name}` : t('New unit')} onClose={onClose}
      footer={<div className="flex justify-between gap-2">{unit ? <Btn tone="ghost" onClick={del}><Trash2 className="h-4 w-4" /></Btn> : <span />}<span className="flex gap-2"><Btn onClick={onClose}>{t('Cancel')}</Btn><Btn tone="brand" type="submit" form="unit-form">{t('Save')}</Btn></span></div>}>
      <form id="unit-form" onSubmit={save} className="space-y-3">
        {onReserve && unit && (unit.status === 'available' || unit.status === 'option') && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-brand/10 p-3"><p className="text-sm">{t('A buyer for this unit? Reserve it with a payment schedule.')}</p><Btn tone="brand" type="button" onClick={onReserve}>{t('Reserve')}</Btn></div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {UNIT_STATUSES.map(s => <button key={s} type="button" aria-pressed={f.status === s} onClick={() => setF({ ...f, status: s })} className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${f.status === s ? UNIT_CLS[s] : 'bg-surface text-muted ring-line/10'}`}>{unitStatusLabel(s)}</button>)}
        </div>
        {needsBuyer && (
          <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
            <Field label={t('Buyer')}><input className={inputCls} value={f.buyerName} onChange={e => setF({ ...f, buyerName: e.target.value })} maxLength={200} /></Field>
            <Field label={t('Phone or WhatsApp')}><input className={inputCls} dir="ltr" value={f.buyerPhone} onChange={e => setF({ ...f, buyerPhone: e.target.value })} maxLength={40} /></Field>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('Reference')}><input className={inputCls} value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} maxLength={40} placeholder="A-101" /></Field>
          <Field label={t('Building')}><input className={inputCls} value={f.building} onChange={e => setF({ ...f, building: e.target.value })} maxLength={40} /></Field>
          <Field label={t('Floor')}><input className={inputCls} inputMode="numeric" value={f.floor} onChange={e => setF({ ...f, floor: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_KINDS.map(k => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`rounded-full px-3 py-1 text-xs font-semibold ${f.kind === k ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{unitKindLabel(k)}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('Bedrooms')}><input className={inputCls} inputMode="numeric" value={f.bedrooms} onChange={e => setF({ ...f, bedrooms: e.target.value })} /></Field>
          <Field label={t('Area (m²)')}><input className={inputCls} inputMode="decimal" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} /></Field>
          <Field label={t('Terrace (m²)')}><input className={inputCls} inputMode="decimal" value={f.terrace} onChange={e => setF({ ...f, terrace: e.target.value })} /></Field>
          <Field label={t('Price (DH)')}><input className={inputCls} inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field>
        </div>
        {tranches.length > 0 && (
          <Field label={t('Tranche')}><select className={inputCls} value={f.tranche} onChange={e => setF({ ...f, tranche: e.target.value })}>
            <option value="">{t('No tranche')}</option>{tranches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></Field>
        )}
        <Field label={t('Notes')}><textarea className={inputCls} rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} maxLength={2000} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

/** Change many units at once: status, price (fixed or per m²) or tranche. */
function BulkBar({ units, tranches, onDone, onCancel }: { units: Unit[]; tranches: Tranche[]; onDone: (msg: string | null) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'status' | 'price' | 'm2' | 'tranche'>('status');
  const [status, setStatus] = useState<UnitStatus>('available');
  const [value, setValue] = useState('');
  const [tranche, setTranche] = useState('');
  const apply = async () => {
    const ids = units.map(u => u.id);
    let r;
    if (mode === 'status') r = await supabase.from('dev_units').update({ status }).in('id', ids).select('id');
    else if (mode === 'tranche') r = await supabase.from('dev_units').update({ tranche_id: tranche || null }).in('id', ids).select('id');
    else {
      const v = num(value); if (!v) return;
      if (mode === 'price') r = await supabase.from('dev_units').update({ price_cents: dirhamToCents(v) }).in('id', ids).select('id');
      else {
        const withArea = units.filter(u => u.area_m2);
        const res = await Promise.all(withArea.map(u => supabase.from('dev_units').update({ price_cents: Math.round(dirhamToCents(v) * u.area_m2! / 100) * 100 }).eq('id', u.id).select('id')));
        r = res.find(x => x.error) ?? { error: null };
        if (!r.error && withArea.length < units.length) { onDone(t('{n} units have no area and were left as they were.', { n: units.length - withArea.length })); return; }
      }
    }
    onDone(r.error ? err(r.error.message) : null);
  };
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 lg:bottom-4 lg:ps-60">
      <div className="card pop mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl p-3 shadow-xl">
        <span className="text-sm font-bold">{t('{n} selected', { n: units.length })}</span>
        <select className="rounded-lg bg-surface-2 px-2 py-1.5 text-sm" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
          <option value="status">{t('Status')}</option><option value="price">{t('Price')}</option><option value="m2">{t('Price per m²')}</option>{tranches.length > 0 && <option value="tranche">{t('Tranche')}</option>}
        </select>
        {mode === 'status' && <select className="rounded-lg bg-surface-2 px-2 py-1.5 text-sm" value={status} onChange={e => setStatus(e.target.value as UnitStatus)}>{UNIT_STATUSES.filter(s => s !== 'sold').map(s => <option key={s} value={s}>{unitStatusLabel(s)}</option>)}</select>}
        {(mode === 'price' || mode === 'm2') && <input className="w-32 rounded-lg bg-surface-2 px-2 py-1.5 text-sm" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder={mode === 'm2' ? t('DH per m²') : 'DH'} />}
        {mode === 'tranche' && <select className="rounded-lg bg-surface-2 px-2 py-1.5 text-sm" value={tranche} onChange={e => setTranche(e.target.value)}><option value="">{t('No tranche')}</option>{tranches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <span className="ms-auto flex gap-2"><Btn onClick={onCancel}><X className="h-4 w-4" /></Btn><Btn tone="brand" onClick={apply} disabled={!units.length}><Check className="h-4 w-4" /> {t('Apply')}</Btn></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the stock grid
function Grid({ units, buyers, selecting, selected, onTap }: { units: Unit[]; buyers: Map<string, Buyer>; selecting: boolean; selected: Set<string>; onTap: (u: Unit) => void }) {
  const buildings = useMemo(() => {
    const m = new Map<string, Unit[]>();
    for (const u of units) { const k = u.building ?? ''; m.set(k, [...(m.get(k) ?? []), u]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [units]);
  if (units.length === 0) return <p className="mt-6 text-center text-sm text-muted">{t('No units match.')}</p>;
  return (
    <div className="mt-4 space-y-5">
      {buildings.map(([b, list]) => {
        const floors = [...new Set(list.map(u => u.floor))].sort((x, y) => (y ?? -99) - (x ?? -99));
        return (
          <section key={b}>
            {(buildings.length > 1 || b) && <h3 className="mb-2 text-sm font-semibold">{b ? t('Building {b}', { b }) : t('Without building')}</h3>}
            <div className="space-y-1.5 overflow-x-auto pb-1">
              {floors.map(f => (
                <div key={String(f)} className="flex items-stretch gap-1.5">
                  <span className="sticky start-0 z-[1] flex w-20 shrink-0 items-center bg-bg pe-1 text-[11px] font-semibold text-muted">{floorLabel(f)}</span>
                  {list.filter(u => u.floor === f).sort((x, y) => x.reference.localeCompare(y.reference, undefined, { numeric: true })).map(u => {
                    const sel = selected.has(u.id);
                    return (
                      <button key={u.id} type="button" onClick={() => onTap(u)} title={buyers.get(u.id)?.buyer_name ?? ''}
                        className={`relative w-[5.5rem] shrink-0 rounded-xl px-2 py-1.5 text-start ring-1 transition hover:scale-[1.03] ${UNIT_CLS[u.status]} ${sel ? 'outline outline-2 outline-offset-1 outline-brand' : ''}`}>
                        {selecting && <span className={`absolute end-1 top-1 grid h-4 w-4 place-items-center rounded-full ${sel ? 'bg-brand text-white' : 'bg-white/60'}`}>{sel && <Check className="h-3 w-3" />}</span>}
                        <span className="block truncate text-xs font-bold">{u.reference}</span>
                        <span className="block truncate text-[10px] opacity-80">{u.area_m2 ? `${u.area_m2} m²` : unitKindLabel(u.kind)}{u.bedrooms ? ` · ${t('{n} bd.', { n: u.bedrooms })}` : ''}</span>
                        <span className="block truncate text-[10px] font-semibold tabular">{u.price_cents ? formatMad(u.price_cents).replace(/\s?DH$/, '') : '—'}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tranches({ office, project, tranches, units, onChanged }: { office: Office; project: Project; tranches: Tranche[]; units: Unit[]; onChanged: () => void }) {
  const canWrite = office.role !== 'viewer';
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await supabase.from('dev_tranches').insert({ org_id: office.id, project_id: project.id, name: name.trim(), position: tranches.length + 1, delivery_date: date || null }).select('id');
    if (r.error) setError(err(r.error.message)); else { setName(''); setDate(''); setError(null); onChanged(); }
  };
  const del = async (x: Tranche) => { if (!window.confirm(t('Remove this tranche? The units stay, without tranche.'))) return; await supabase.from('dev_tranches').delete().eq('id', x.id); onChanged(); };
  return (
    <div className="mt-4 space-y-2">
      {tranches.map(x => { const s = stats(units.filter(u => u.tranche_id === x.id)); return (
        <div key={x.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
          <span><span className="font-semibold">{x.name}</span><span className="block text-xs text-muted">{x.delivery_date ? t('Delivery {date}', { date: day(x.delivery_date) }) : t('No delivery date')} · {t('{s} of {n} sold', { s: s.sold, n: s.total })}</span></span>
          {canWrite && <button type="button" onClick={() => del(x)} aria-label={t('Remove')} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
        </div>); })}
      {tranches.length === 0 && <p className="text-sm text-muted">{t('A project in phases? Add a tranche per phase, each with its own delivery date.')}</p>}
      {canWrite && (
        <form onSubmit={add} className="flex flex-wrap gap-2 rounded-2xl bg-surface-2 p-3">
          <input className={`${inputCls} flex-1`} value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder={t('Tranche {n}', { n: tranches.length + 1 })} />
          <input type="date" className={`${inputCls} w-44`} value={date} onChange={e => setDate(e.target.value)} aria-label={t('Delivery')} />
          <Btn tone="brand" type="submit"><Plus className="h-4 w-4" /> {t('Add')}</Btn>
        </form>
      )}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

function ProjectView({ office, project, onBack, onChanged }: { office: Office; project: Project; onBack: () => void; onChanged: () => void }) {
  const canWrite = office.role !== 'viewer';
  const [data, setData] = useState<{ tranches: Tranche[]; units: Unit[]; buyers: Map<string, Buyer> } | null>(null);
  const [tab, setTab] = useState<'grid' | 'list' | 'sales' | 'marketing' | 'tranches'>('grid');
  const [sales, setSales] = useState<SaleData | null>(null);
  const [saleFor, setSaleFor] = useState<Unit | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<UnitStatus | ''>('');
  const [fTranche, setFTranche] = useState('');
  const [fKind, setFKind] = useState<UnitKind | ''>('');
  const [edit, setEdit] = useState<{ unit?: Unit } | null>(null);
  const [series, setSeries] = useState(false);
  const [editProject, setEditProject] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [proj, setProj] = useState<Project>(project);
  const load = useCallback(async () => {
    const [d, sl, pr] = await Promise.all([loadProject(project.id, office.role !== 'viewer'), office.role !== 'viewer' ? loadSales(project.id) : Promise.resolve(null),
      supabase.from('dev_projects').select('*').eq('id', project.id).single()]);
    setData(d); setSales(sl); if (pr.data) setProj(pr.data as Project);
  }, [project.id, office.role]);
  useEffect(() => { load(); }, [load]);

  const units = data?.units ?? [];
  const ctx = data ? { office, project: proj, tranches: data.tranches, units, buyers: data.buyers } : null;
  const openSaleRow: Sale | undefined = sales?.sales.find(x => x.id === openSale);
  const shown = units.filter(u => (!fStatus || u.status === fStatus) && (!fTranche || u.tranche_id === fTranche) && (!fKind || u.kind === fKind));
  const s = stats(units);
  const kinds = [...new Set(units.map(u => u.kind))];
  const tap = (u: Unit) => {
    if (!selecting) {
      const sale = sales?.sales.find(x => x.unit_id === u.id && x.status !== 'cancelled');
      if (sale) setOpenSale(sale.id); else if (canWrite) setEdit({ unit: u });
      return;
    }
    const n = new Set(selected); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); setSelected(n);
  };
  const exportList = () => downloadCsv(`${project.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(
    [t('Reference'), t('Building'), t('Floor'), t('Type'), t('Bedrooms'), t('Area (m²)'), t('Terrace (m²)'), t('Price'), t('Price per m²'), t('Status'), t('Tranche'), ...(canWrite ? [t('Buyer')] : [])],
    shown.map(u => [u.reference, u.building, u.floor, unitKindLabel(u.kind), u.bedrooms, u.area_m2 === null ? '' : String(u.area_m2).replace('.', ','), u.terrace_m2 === null ? '' : String(u.terrace_m2).replace('.', ','),
      u.price_cents === null ? '' : String(u.price_cents / 100), perM2(u) === null ? '' : String(Math.round(perM2(u)! / 100)), unitStatusLabel(u.status),
      data?.tranches.find(x => x.id === u.tranche_id)?.name ?? '', ...(canWrite ? [data?.buyers.get(u.id)?.buyer_name ?? ''] : [])])));
  const shareAvailable = () => {
    const free = units.filter(u => u.status === 'available').sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));
    const lines = free.slice(0, 40).map(u => `• ${u.reference} · ${unitKindLabel(u.kind)}${u.bedrooms ? ` ${t('{n} bd.', { n: u.bedrooms })}` : ''}${u.area_m2 ? ` · ${u.area_m2} m²` : ''}${u.price_cents ? ` · ${formatMad(u.price_cents)}` : ''}`);
    const text = `${project.name}${project.city ? `, ${project.city}` : ''}\n${t('{n} units available', { n: free.length })}:\n${lines.join('\n')}${free.length > 40 ? '\n…' : ''}\n— ${office.name}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 pb-32 sm:px-6 sm:py-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('All projects')}</button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{project.name}</h1>
          <p className="text-sm text-muted">{[project.city, projectStatusLabel(project.status), project.delivery_date ? t('Delivery {date}', { date: day(project.delivery_date) }) : null].filter(Boolean).join(' · ')}</p>
        </div>
        {canWrite && <Btn tone="ghost" onClick={() => setEditProject(true)}>{t('Edit')}</Btn>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><p className="text-xs text-muted sm:text-sm">{t('Units')}</p><p className="font-display tabular mt-1 text-xl font-bold">{s.total}</p><p className="text-xs text-muted">{t('{n} available', { n: s.available })}</p></Card>
        <Card><p className="text-xs text-muted sm:text-sm">{t('Sold')}</p><p className="font-display tabular mt-1 text-xl font-bold">{s.total ? Math.round(s.sold / s.total * 100) : 0}%</p><p className="text-xs text-muted">{t('{n} units', { n: s.sold })}</p></Card>
        <Card><p className="text-xs text-muted sm:text-sm">{t('Sales')}</p><p className="font-display tabular mt-1 whitespace-nowrap text-base font-bold sm:text-xl">{formatMad(s.soldCents)}</p><p className="text-xs text-muted">{t('+ {amount} reserved', { amount: formatMad(s.reservedCents) })}</p></Card>
        <Card><p className="text-xs text-muted sm:text-sm">{t('Stock still to sell')}</p><p className="font-display tabular mt-1 whitespace-nowrap text-base font-bold sm:text-xl">{formatMad(s.stockCents)}</p><p className="text-xs text-muted">{t('{n} on option', { n: s.option })}</p></Card>
      </div>
      {s.total > 0 && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          {(['sold', 'reserved', 'option', 'available', 'blocked'] as const).map(x => { const n = units.filter(u => u.status === x).length; return n ? <span key={x} className={UNIT_CLS[x].split(' ')[0]} style={{ width: `${n / s.total * 100}%` }} /> : null; })}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-1.5" role="tablist">
        {(['grid', 'list', 'sales', 'marketing', 'tranches'] as const).filter(x => x !== 'sales' || sales).map(x => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
            {({ grid: t('Stock grid'), list: t('Price list'), sales: t('Sales and payments'), marketing: t('Page, team and leads'), tranches: t('Works and tranches') })[x]}
          </button>
        ))}
        {(tab === 'grid' || tab === 'list') && <span className="ms-auto flex flex-wrap gap-2">
          {canWrite && <Btn tone="brand" onClick={() => setSeries(true)}><Plus className="h-4 w-4" /> {t('Add units')}</Btn>}
          {canWrite && units.length > 0 && <Btn tone="ghost" onClick={() => setEdit({})}><Plus className="h-4 w-4" /> {t('One unit')}</Btn>}
        </span>}
      </div>

      {(tab === 'grid' || tab === 'list') && units.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={!fStatus} onClick={() => setFStatus('')} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${!fStatus ? 'bg-ink text-bg ring-ink' : 'bg-surface text-muted ring-line/10'}`}>{t('All')} {units.length}</button>
          {UNIT_STATUSES.map(x => { const n = units.filter(u => u.status === x).length; return n ? (
            <button key={x} type="button" aria-pressed={fStatus === x} onClick={() => setFStatus(fStatus === x ? '' : x)} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${UNIT_CLS[x]} ${fStatus && fStatus !== x ? 'opacity-40' : ''}`}>{unitStatusLabel(x)} {n}</button>) : null; })}
          {(data?.tranches.length ?? 0) > 0 && <select className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10" value={fTranche} onChange={e => setFTranche(e.target.value)}><option value="">{t('All tranches')}</option>{data!.tranches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          {kinds.length > 1 && <select className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line/10" value={fKind} onChange={e => setFKind(e.target.value as UnitKind | '')}><option value="">{t('All types')}</option>{kinds.map(k => <option key={k} value={k}>{unitKindLabel(k)}</option>)}</select>}
        </div>
      )}
      {(tab === 'grid' || tab === 'list') && units.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 [&>button]:whitespace-nowrap">
            {canWrite && tab === 'grid' && <Btn tone="ghost" onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><MousePointerClick className="h-4 w-4" /> {selecting ? t('Stop selecting') : t('Select')}</Btn>}
            {s.available > 0 && <Btn tone="ghost" onClick={shareAvailable}><MessageCircle className="h-4 w-4" /> {t('Share availability')}</Btn>}
            <Btn tone="ghost" onClick={exportList}><Download className="h-4 w-4" /> {t('Export to Excel')}</Btn>
        </div>
      )}
      {note && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{note}</p>}
      {!data && <p className="mt-8 text-center text-muted">…</p>}

      {data && units.length === 0 && (tab === 'grid' || tab === 'list') && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Layers className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No units yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Add the units building by building: floors, units per floor, area and price. The grid shows at a glance what is still for sale.')}</p>
        </Card>
      )}
      {data && units.length > 0 && tab === 'grid' && (
        <>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">{UNIT_STATUSES.map(x => <span key={x} className="flex items-center gap-1"><span className={`h-3 w-3 rounded ring-1 ${UNIT_CLS[x]}`} />{unitStatusLabel(x)}</span>)}</div>
          <Grid units={shown} buyers={data.buyers} selecting={selecting} selected={selected} onTap={tap} />
        </>
      )}
      {data && units.length > 0 && tab === 'list' && (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-surface ring-1 ring-line/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line/10 text-start text-xs text-muted">{[t('Reference'), t('Floor'), t('Type'), t('Area (m²)'), t('Price'), t('Price per m²'), t('Status'), ...(canWrite ? [t('Buyer')] : [])].map(h => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map(u => (
                <tr key={u.id} onClick={() => tap(u)} className="cursor-pointer border-b border-line/[0.06] hover:bg-surface-2">
                  <td className="px-3 py-2 font-semibold">{u.reference}</td>
                  <td className="px-3 py-2 text-muted">{floorLabel(u.floor)}</td>
                  <td className="px-3 py-2">{unitKindLabel(u.kind)}{u.bedrooms ? ` · ${t('{n} bd.', { n: u.bedrooms })}` : ''}</td>
                  <td className="tabular px-3 py-2">{u.area_m2 ?? '—'}{u.terrace_m2 ? <span className="text-xs text-muted"> + {u.terrace_m2}</span> : null}</td>
                  <td className="tabular px-3 py-2">{u.price_cents ? formatMad(u.price_cents) : '—'}</td>
                  <td className="tabular px-3 py-2 text-muted">{perM2(u) ? formatMad(perM2(u)!) : '—'}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${UNIT_CLS[u.status]}`}>{unitStatusLabel(u.status)}</span></td>
                  {canWrite && <td className="px-3 py-2 text-muted">{data.buyers.get(u.id)?.buyer_name ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && tab === 'marketing' && <ProjectMarketing office={office} project={proj} onChanged={load} />}
      {data && tab === 'sales' && sales && <SalesTab ctx={ctx!} data={sales} onOpen={x => setOpenSale(x.id)} />}
      {data && tab === 'tranches' && sales && <WorksPanel ctx={ctx!} data={sales} onChanged={load} />}
      {data && tab === 'tranches' && <Tranches office={office} project={project} tranches={data.tranches} units={units} onChanged={load} />}
      {saleFor && ctx && <SaleForm ctx={ctx} unit={saleFor} onClose={() => setSaleFor(null)} onSaved={() => { setSaleFor(null); load(); }} />}
      {openSaleRow && ctx && sales && <SaleView ctx={ctx} sale={openSaleRow} data={sales} onClose={() => setOpenSale(null)} onChanged={load}
        onEditUnit={() => { const u = units.find(x => x.id === openSaleRow.unit_id); setOpenSale(null); if (u) setEdit({ unit: u }); }} />}

      {selecting && <BulkBar units={units.filter(u => selected.has(u.id))} tranches={data?.tranches ?? []} onCancel={() => { setSelecting(false); setSelected(new Set()); }}
        onDone={m => { setNote(m); setSelecting(false); setSelected(new Set()); load(); }} />}
      {series && data && <SeriesForm project={project} tranches={data.tranches} onClose={() => setSeries(false)} onSaved={() => { setSeries(false); load(); }} />}
      {edit && data && <UnitForm office={office} project={project} tranches={data.tranches} unit={edit.unit} buyer={edit.unit ? data.buyers.get(edit.unit.id) : undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }}
        onReserve={sales ? () => { const u = edit.unit!; setEdit(null); setSaleFor(u); } : undefined} />}
      {editProject && <ProjectForm office={office} project={project} onClose={() => setEditProject(false)} onSaved={id => { setEditProject(false); if (!id) onBack(); else onChanged(); }} />}
    </div>
  );
}

export function Projects({ office }: { office: Office }) {
  const [rows, setRows] = useState<Project[] | null | undefined>(undefined);
  const [units, setUnits] = useState<Unit[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState(false);
  const canWrite = office.role !== 'viewer';
  const boss = office.role === 'owner' || office.role === 'manager';
  const load = useCallback(async () => {
    const r = await loadProjects(office.id);
    setRows(r);
    if (!r) return;
    const u = await supabase.from('dev_units').select('project_id, status, price_cents').eq('org_id', office.id);
    setUnits((u.data ?? []) as Unit[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);

  const opened = rows?.find(r => r.id === openId);
  if (opened) return <ProjectView key={opened.id} office={office} project={opened} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Projects')}</h1>
          <p className="text-sm text-muted">{t('New-build projects: tranches, units in stock, prices and what is sold.')}</p>
        </div>
        <span className="flex flex-wrap gap-2">
          {boss && rows && rows.length > 0 && <Btn tone="ghost" onClick={() => setReport(true)}><BarChart3 className="h-4 w-4" /> {t('Sales report')}</Btn>}
          {canWrite && rows && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('New project')}</Btn>}
        </span>
      </div>
      {rows === undefined && <p className="mt-10 text-center text-muted">…</p>}
      {rows === null && <p className="mt-6 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 10a first.')}</p>}
      {rows && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><HardHat className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No projects yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Are you a developer, or do you sell a project for one? Add the project and its units, and follow the sales unit by unit.')}</p>
        </Card>
      )}
      {rows && rows.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {rows.map(p => { const s = stats(units.filter(u => u.project_id === p.id)); return (
            <li key={p.id}><button type="button" onClick={() => setOpenId(p.id)} className="card w-full rounded-2xl p-4 text-start transition hover:ring-2 hover:ring-brand/25">
              <p className="font-display text-lg font-bold">{p.name}</p>
              <p className="text-xs text-muted">{[p.city, projectStatusLabel(p.status), p.delivery_date ? t('Delivery {date}', { date: day(p.delivery_date) }) : null].filter(Boolean).join(' · ')}</p>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">{s.total > 0 && (['sold', 'reserved', 'option', 'available'] as const).map(x => { const n = x === 'sold' ? s.sold : x === 'reserved' ? s.reserved : x === 'option' ? s.option : s.available; return n ? <span key={x} className={UNIT_CLS[x].split(' ')[0]} style={{ width: `${n / s.total * 100}%` }} /> : null; })}</div>
              <p className="mt-2 text-sm">{t('{s} of {n} sold', { s: s.sold, n: s.total })} · <span className="text-muted">{t('{n} available', { n: s.available })}</span></p>
              {canWrite && s.soldCents > 0 && <p className="text-xs text-muted">{t('Sales')}: <span className="tabular font-semibold text-ink">{formatMad(s.soldCents)}</span></p>}
            </button></li>); })}
        </ul>
      )}
      {report && <ProjectReport office={office} onClose={() => setReport(false)} />}
      {adding && <ProjectForm office={office} onClose={() => setAdding(false)} onSaved={id => { setAdding(false); load().then(() => setOpenId(id)); }} />}
    </div>
  );
}
