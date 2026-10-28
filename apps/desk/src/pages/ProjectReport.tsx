import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MessageCircle, Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { LeadSource, Office } from '../lib/types';
import {
  BUILD_STEPS, dueOf, milestoneLabel, type Buyer, type Installment, type Project, type Sale, type Tranche, type Unit,
} from '../lib/projects';
import { sourceLabel } from '../lib/labels';
import { downloadCsv, toCsv } from '../lib/exportCsv';
import { waLink } from '../components/ContactLinks';
import { Btn } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const monthKey = (d: string) => d.slice(0, 7);
const monthName = (k: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${k}-01T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);
const addMonths = (k: string, n: number) => { const d = new Date(`${k}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const days = (from: string) => Math.max(0, Math.round((Date.parse(today()) - Date.parse(from)) / 86400000));
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0);
type Period = '12m' | 'year' | 'all';
type Lead = { id: string; project_id: string; status: string; source: LeadSource | null; created_at: string };
type Member = { user_id: string; email: string };
type Data = { projects: Project[]; tranches: Tranche[]; units: Unit[]; sales: Sale[]; inst: Installment[]; leads: Lead[]; members: Member[]; buyers: Map<string, Buyer> };

async function loadAll(orgId: string): Promise<Data> {
  const [pr, tr, un, sa, mb, ld] = await Promise.all([
    supabase.from('dev_projects').select('*').eq('org_id', orgId).eq('archived', false).order('name'),
    supabase.from('dev_tranches').select('*').eq('org_id', orgId),
    supabase.from('dev_units').select('id, org_id, project_id, tranche_id, reference, kind, building, floor, bedrooms, area_m2, terrace_m2, price_cents, status, notes, status_changed_at').eq('org_id', orgId),
    supabase.from('dev_sales').select('*').eq('org_id', orgId),
    supabase.rpc('list_members', { p_org: orgId }),
    supabase.from('leads').select('id, project_id, status, source, created_at').eq('org_id', orgId).not('project_id', 'is', null),
  ]);
  const projects = (pr.data ?? []) as Project[];
  const sales = (sa.data ?? []) as Sale[];
  const [inst, ...by] = await Promise.all([
    sales.length ? supabase.from('dev_installments').select('*').in('sale_id', sales.map(s => s.id)) : Promise.resolve({ data: [] }),
    ...projects.map(p => supabase.rpc('dev_unit_buyers', { p_project: p.id })),
  ]);
  const buyers = new Map<string, Buyer>();
  for (const r of by) for (const b of ((r.data ?? []) as Buyer[])) buyers.set(b.unit_id, b);
  return {
    projects, tranches: (tr.data ?? []) as Tranche[], sales, buyers,
    units: ((un.data ?? []) as Unit[]).map(u => ({ ...u, area_m2: u.area_m2 === null ? null : Number(u.area_m2) })),
    inst: ((inst.data ?? []) as Installment[]).map(i => ({ ...i, pct: Number(i.pct) })),
    leads: (ld.data ?? []) as Lead[], members: (mb.data ?? []) as Member[],
  };
}

function Bars({ rows, money }: { rows: { label: string; value: number; sub?: number }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {rows.map(r => (
        <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="tabular text-[9px] text-black/60">{r.value ? (money ? `${Math.round(r.value / 10000000) / 10}M` : r.value) : ''}</span>
          <div className="w-full rounded-t bg-[#0b2a4a]" style={{ height: `${Math.max(r.value ? 3 : 0, r.value / max * 110)}px` }} title={money ? formatMad(r.value) : String(r.value)} />
          <span className="truncate text-[9px] text-black/60">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

const th = 'border-b border-black/15 px-2 py-1.5 text-start text-[11px] font-bold uppercase text-black/55';
const td = 'border-b border-black/[0.07] px-2 py-1.5 tabular';

/** The management report of a developer: sales per month, money in and to come, late buyers, leads and sellers. */
export function ProjectReport({ office, onClose }: { office: Office; onClose: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [project, setProject] = useState('');
  const [period, setPeriod] = useState<Period>('12m');
  useEffect(() => { loadAll(office.id).then(setD); }, [office.id]);

  const r = useMemo(() => {
    if (!d) return null;
    const inP = (id: string) => !project || id === project;
    const projects = d.projects.filter(p => inP(p.id));
    const units = d.units.filter(u => inP(u.project_id));
    const sales = d.sales.filter(s => inP(s.project_id));
    const live = sales.filter(s => s.status !== 'cancelled');
    const liveIds = new Set(live.map(s => s.id));
    const inst = d.inst.filter(i => liveIds.has(i.sale_id));
    const leads = d.leads.filter(l => inP(l.project_id));
    const nowK = monthKey(today());
    const start = period === '12m' ? addMonths(nowK, -11) : period === 'year' ? `${nowK.slice(0, 4)}-01` : '0000-00';
    const inPeriod = (dt: string | null) => !!dt && monthKey(dt) >= start;
    const saleOf = new Map(sales.map(s => [s.id, s]));
    const due = (i: Installment) => { const s = saleOf.get(i.sale_id)!; const u = d.units.find(x => x.id === s.unit_id); return dueOf(i, s, d.projects.find(p => p.id === s.project_id)!, d.tranches.find(x => x.id === u?.tranche_id)); };

    const soldP = live.filter(s => inPeriod(s.reserved_on));
    const collectedP = inst.filter(i => inPeriod(i.paid_on)).reduce((a, i) => a + i.paid_cents, 0);
    const late = inst.filter(i => i.paid_cents < i.amount_cents && (due(i) ?? '9999') <= today());
    const lateCents = late.reduce((a, i) => a + i.amount_cents - i.paid_cents, 0);
    const stock = units.filter(u => u.status === 'available' || u.status === 'option');

    // last 12 months (or the year): number and value of reservations, and money received
    const months: string[] = []; for (let k = period === 'all' ? addMonths(nowK, -11) : start; k <= nowK; k = addMonths(k, 1)) months.push(k);
    const perMonth = months.map(k => ({
      label: monthName(k),
      n: live.filter(s => monthKey(s.reserved_on) === k).length,
      value: live.filter(s => monthKey(s.reserved_on) === k).reduce((a, s) => a + s.price_cents, 0),
      cash: inst.filter(i => i.paid_on && monthKey(i.paid_on) === k).reduce((a, i) => a + i.paid_cents, 0),
    }));

    // money still to come: by month when the date is known, by building step when it is not reached yet
    const open = inst.filter(i => i.paid_cents < i.amount_cents);
    const ahead = Array.from({ length: 6 }, (_, n) => addMonths(nowK, n + 1)).map(k => ({ label: monthName(k), value: open.filter(i => { const x = due(i); return x && x > today() && monthKey(x) === k; }).reduce((a, i) => a + i.amount_cents - i.paid_cents, 0) }));
    const byStep = [...BUILD_STEPS, 'deed' as const].map(m => ({ m, value: open.filter(i => i.milestone === m && !due(i)).reduce((a, i) => a + i.amount_cents - i.paid_cents, 0) })).filter(x => x.value > 0);
    const toCome = open.reduce((a, i) => a + i.amount_cents - i.paid_cents, 0);

    const perProject = projects.map(p => {
      const pu = units.filter(u => u.project_id === p.id); const ps = live.filter(s => s.project_id === p.id); const ids = new Set(ps.map(s => s.id));
      const pi = inst.filter(i => ids.has(i.sale_id));
      return {
        p, units: pu.length, sold: pu.filter(u => u.status === 'sold').length, reserved: pu.filter(u => u.status === 'reserved').length,
        value: ps.reduce((a, s) => a + s.price_cents, 0), paid: pi.reduce((a, i) => a + i.paid_cents, 0),
        late: pi.filter(i => i.paid_cents < i.amount_cents && (due(i) ?? '9999') <= today()).reduce((a, i) => a + i.amount_cents - i.paid_cents, 0),
        stock: pu.filter(u => u.status === 'available' || u.status === 'option').reduce((a, u) => a + (u.price_cents ?? 0), 0),
      };
    });

    const lateBuyers = [...new Set(late.map(i => i.sale_id))].map(id => {
      const s = saleOf.get(id)!; const mine = late.filter(i => i.sale_id === id);
      const oldest = mine.map(due).filter(Boolean).sort()[0] as string;
      return { s, unit: d.units.find(u => u.id === s.unit_id), project: d.projects.find(p => p.id === s.project_id), buyer: d.buyers.get(s.unit_id), cents: mine.reduce((a, i) => a + i.amount_cents - i.paid_cents, 0), days: days(oldest) };
    }).sort((a, b) => b.cents - a.cents);

    const leadsP = leads.filter(l => inPeriod(l.created_at));
    const won = leadsP.filter(l => l.status === 'won').length;
    const bySource = [...new Set(leadsP.map(l => l.source ?? 'other'))].map(src => ({ src: src as LeadSource, n: leadsP.filter(l => (l.source ?? 'other') === src).length, won: leadsP.filter(l => (l.source ?? 'other') === src && l.status === 'won').length })).sort((a, b) => b.n - a.n);
    const sellers = d.members.map(m => {
      const ms = soldP.filter(s => s.seller_user_id === m.user_id); const ids = new Set(ms.map(s => s.id));
      return { m, n: ms.length, value: ms.reduce((a, s) => a + s.price_cents, 0), paid: inst.filter(i => ids.has(i.sale_id)).reduce((a, i) => a + i.paid_cents, 0) };
    }).filter(x => x.n > 0).sort((a, b) => b.value - a.value);
    const cancelledP = sales.filter(s => s.status === 'cancelled' && inPeriod(s.cancelled_on)).length;

    return { projects, units, stock, soldP, collectedP, lateCents, perMonth, ahead, byStep, toCome, perProject, lateBuyers, leadsP, won, bySource, sellers, cancelledP };
  }, [d, project, period]);

  const remind = (x: NonNullable<typeof r>['lateBuyers'][number]) => {
    const first = (x.buyer?.buyer_name ?? '').split(/\s+/)[0] ?? '';
    const text = `Bonjour ${first}, sauf erreur de notre part, un montant de ${formatMad(x.cents)} reste à régler pour le lot ${x.unit?.reference} du projet ${x.project?.name}. Merci de procéder au paiement ou de nous contacter.\n— ${office.name}`;
    window.open(x.buyer?.buyer_phone ? `${waLink(x.buyer.buyer_phone)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const exportCsv = () => r && downloadCsv(`rapport-promotion-${today()}.csv`, toCsv(
    [t('Project'), t('Units'), t('Sold'), t('Reserved'), t('Sales value'), t('Received'), t('Due now'), t('Stock still to sell')],
    r.perProject.map(x => [x.p.name, x.units, x.sold, x.reserved, String(x.value / 100), String(x.paid / 100), String(x.late / 100), String(x.stock / 100)])));

  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-5xl rounded-2xl bg-white p-4 text-[#111] shadow-2xl sm:p-8">
        <div className="no-print mb-5 flex flex-wrap items-center gap-2">
          <select value={project} onChange={e => setProject(e.target.value)} className="rounded-lg bg-black/5 px-2.5 py-2 text-sm font-semibold">
            <option value="">{t('All projects')}</option>{d?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="rounded-lg bg-black/5 px-2.5 py-2 text-sm font-semibold">
            <option value="12m">{t('Last 12 months')}</option><option value="year">{t('This year')}</option><option value="all">{t('Since the start')}</option>
          </select>
          <span className="ms-auto flex gap-2">
            <Btn tone="ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Excel</Btn>
            <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
            <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
          </span>
        </div>
        {!r ? <p className="py-16 text-center text-black/50">…</p> : (
          <div className="space-y-6 text-[13px]">
            <div>
              <p className="text-xl font-black">{t('Sales report')} · {project ? r.projects[0]?.name : t('All projects')}</p>
              <p className="text-black/60">{office.name} · {({ '12m': t('Last 12 months'), year: t('This year'), all: t('Since the start') })[period]} · {new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'long' }).format(new Date())}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { l: t('Units reserved or sold'), v: String(r.soldP.length), s: r.cancelledP ? t('{n} cancelled', { n: r.cancelledP }) : '' },
                { l: t('Sales value'), v: formatMad(r.soldP.reduce((a, s) => a + s.price_cents, 0)), s: '' },
                { l: t('Received'), v: formatMad(r.collectedP), s: '' },
                { l: t('Due now'), v: formatMad(r.lateCents), s: t('{n} buyers', { n: r.lateBuyers.length }), bad: r.lateCents > 0 },
                { l: t('Stock still to sell'), v: formatMad(r.stock.reduce((a, u) => a + (u.price_cents ?? 0), 0)), s: t('{n} units', { n: r.stock.length }) },
              ].map(k => (
                <div key={k.l} className="rounded-xl border border-black/10 p-3">
                  <p className="text-[11px] text-black/55">{k.l}</p>
                  <p className={`tabular whitespace-nowrap text-base font-black ${k.bad ? 'text-[#c0392b]' : ''}`}>{k.v}</p>
                  {k.s && <p className="text-[11px] text-black/55">{k.s}</p>}
                </div>
              ))}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="break-inside-avoid"><h3 className="mb-2 font-bold">{t('Reservations per month (value)')}</h3><Bars money rows={r.perMonth.map(m => ({ label: m.label, value: m.value }))} />
                <p className="mt-1 text-[11px] text-black/55">{t('Number')}: {r.perMonth.map(m => m.n).join(' · ')}</p></section>
              <section className="break-inside-avoid"><h3 className="mb-2 font-bold">{t('Money received per month')}</h3><Bars money rows={r.perMonth.map(m => ({ label: m.label, value: m.cash }))} /></section>
            </div>

            <section className="break-inside-avoid">
              <h3 className="mb-2 font-bold">{t('Per project')}</h3>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
                <thead><tr>{[t('Project'), t('Sold'), t('Sales value'), t('Received'), t('Due now'), t('Stock still to sell')].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>{r.perProject.map(x => (
                  <tr key={x.p.id}><td className={`${td} font-semibold`}>{x.p.name}</td><td className={td}>{x.sold + x.reserved} / {x.units} ({pct(x.sold + x.reserved, x.units)}%)</td>
                    <td className={td}>{formatMad(x.value)}</td><td className={td}>{formatMad(x.paid)} <span className="text-black/45">({pct(x.paid, x.value)}%)</span></td>
                    <td className={`${td} ${x.late ? 'font-bold text-[#c0392b]' : ''}`}>{formatMad(x.late)}</td><td className={td}>{formatMad(x.stock)}</td></tr>))}</tbody>
              </table></div>
            </section>

            <section className="break-inside-avoid">
              <h3 className="mb-1 font-bold">{t('Still to receive: {amount}', { amount: formatMad(r.toCome) })}</h3>
              <p className="mb-2 text-[11px] text-black/55">{t('Installments with a known date in the coming months, and installments waiting for a building step.')}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <Bars money rows={r.ahead} />
                <table className="w-full self-start"><tbody>
                  {r.byStep.map(x => <tr key={x.m}><td className={td}>{t('Waiting for: {step}', { step: milestoneLabel(x.m) })}</td><td className={`${td} text-end font-semibold`}>{formatMad(x.value)}</td></tr>)}
                  {r.byStep.length === 0 && <tr><td className={`${td} text-black/50`}>{t('Nothing waiting for a building step.')}</td></tr>}
                </tbody></table>
              </div>
            </section>

            <section className="break-inside-avoid">
              <h3 className="mb-2 font-bold">{t('Late buyers')}</h3>
              {r.lateBuyers.length === 0 ? <p className="text-black/55">{t('Nobody is late. Well done.')}</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                  <thead><tr>{[t('Buyer'), t('Unit'), t('Due now'), t('Days late'), ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>{r.lateBuyers.map(x => (
                    <tr key={x.s.id}><td className={`${td} font-semibold`}>{x.buyer?.buyer_name ?? '—'}</td><td className={td}>{x.unit?.reference} · {x.project?.name}</td>
                      <td className={`${td} font-bold text-[#c0392b]`}>{formatMad(x.cents)}</td><td className={td}>{x.days}</td>
                      <td className={`${td} no-print`}><button type="button" onClick={() => remind(x)} className="inline-flex items-center gap-1 text-xs font-bold text-[#0a8f4e]"><MessageCircle className="h-3.5 w-3.5" /> {t('Reminder')}</button></td></tr>))}</tbody>
                </table></div>
              )}
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="break-inside-avoid">
                <h3 className="mb-2 font-bold">{t('Leads: {n}, of which {w} won ({p}%)', { n: r.leadsP.length, w: r.won, p: pct(r.won, r.leadsP.length) })}</h3>
                <table className="w-full"><thead><tr>{[t('Source'), t('Leads'), t('Won')].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>{r.bySource.map(x => <tr key={x.src}><td className={td}>{sourceLabel(x.src)}</td><td className={td}>{x.n}</td><td className={td}>{x.won} ({pct(x.won, x.n)}%)</td></tr>)}
                    {r.bySource.length === 0 && <tr><td colSpan={3} className={`${td} text-black/50`}>{t('No leads in this period.')}</td></tr>}</tbody></table>
              </section>
              <section className="break-inside-avoid">
                <h3 className="mb-2 font-bold">{t('Per seller')}</h3>
                <table className="w-full"><thead><tr>{[t('Seller'), t('Sales'), t('Sales value'), t('Received')].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>{r.sellers.map(x => <tr key={x.m.user_id}><td className={td}>{x.m.email}</td><td className={td}>{x.n}</td><td className={td}>{formatMad(x.value)}</td><td className={td}>{formatMad(x.paid)}</td></tr>)}
                    {r.sellers.length === 0 && <tr><td colSpan={4} className={`${td} text-black/50`}>{t('No sales in this period.')}</td></tr>}</tbody></table>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
