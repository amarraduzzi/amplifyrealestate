import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronRight, MessageCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { LeadRow, Office, PersonRow } from '../lib/types';
import { loadTasks, sortTasks, toggleTask, type TaskView } from '../lib/tasks';
import { loadViewings, type ViewingView } from '../lib/viewings';
import { loadRentAlerts, type RentAlert } from '../lib/payments';
import { loadRepairAlerts, type RepairAlert } from '../lib/maintenance';
import { formatMad } from '@vastgoed/shared';
import { OPEN_LEAD_STATUSES, daysSince, leadStatusCls, leadStatusLabel, viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { daysUntil, dueText, toInputValue, todayStr, whenText } from '../lib/dates';
import { Card } from '../components/ui';
import { Hero, madShort, PhoneSheet, bigDay } from '../components/Hero';
import { TaskItem } from '../components/TaskItem';
import { briefingText } from '../lib/briefing';
import { whatsappShareUrl } from '../lib/publicSite';
import { GettingStarted } from '../components/GettingStarted';
import { QuickIcons } from '../components/QuickActions';
import { NextUp, nextPrimary, nextRound } from '../components/NextUp';
import { waLink } from '../components/ContactLinks';
import { NewMatches } from '../components/NewMatches';
import { StaleAds } from '../components/StaleAds';
import { WeakAds } from '../components/WeakAds';
import { PayoutsDue } from '../components/PayoutsDue';
import { TaskForm } from './TaskForm';
import { ViewingDetail } from './ViewingDetail';
import type { View } from '../components/Shell';
import { friendly } from '../lib/errors';

type StaleLead = { lead: LeadRow; name: string; phone: string | null; whatsapp: string | null; days: number };
type StaleProp = { id: string; title: string; reference: string; days: number };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const LEAD_DAYS = 14;
const PROP_DAYS = 30;
const AHEAD_DAYS = 7;

function Block({ title, count, to, onGo, children }: { title: string; count: number; to: View; onGo: (v: View) => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title} <span className="tabular text-base opacity-60">{count}</span></h2>
        <button type="button" onClick={() => onGo(to)} className="inline-flex items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      {children}
    </section>
  );
}

/** What needs attention now: tasks due, viewings coming up, leads to call back, prices to re-check. */
export function Today({ office, userId, onGo }: { office: Office; userId: string; onGo: (v: View) => void }) {
  const canWrite = office.role !== 'viewer';
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [viewings, setViewings] = useState<ViewingView[] | null>(null);
  const [leads, setLeads] = useState<StaleLead[] | null>(null);
  const [props, setProps] = useState<StaleProp[] | null>(null);
  const [rent, setRent] = useState<RentAlert[] | null>(null);
  const [repairs, setRepairs] = useState<RepairAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [adCount, setAdCount] = useState(0);
  const [payCount, setPayCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [tk, vw, l, p, pr, ra, rp] = await Promise.all([
        loadTasks(office.id),
        loadViewings(office.id),
        supabase.from('leads').select('*').eq('org_id', office.id).in('status', OPEN_LEAD_STATUSES),
        supabase.from('people').select('id, full_name, phone, whatsapp').eq('org_id', office.id),
        supabase.from('properties').select('id, title, reference, info_confirmed_at').eq('org_id', office.id).eq('status', 'available'),
        loadRentAlerts(office.id, canWrite),
        loadRepairAlerts(office.id),
      ]);
      const err = l.error ?? p.error ?? pr.error;
      if (err) throw new Error(err.message);
      const people = new Map(((p.data ?? []) as Pick<PersonRow, 'id' | 'full_name' | 'phone' | 'whatsapp'>[]).map(x => [x.id, x]));
      setTasks(sortTasks(tk.tasks));
      setViewings(vw);
      setLeads(((l.data ?? []) as LeadRow[])
        .map(x => { const pe = people.get(x.person_id); return { lead: x, name: pe?.full_name ?? '…', phone: pe?.phone ?? null, whatsapp: pe?.whatsapp ?? null, days: daysSince(x.last_contact_at) ?? 0 }; })
        .filter(x => x.days > LEAD_DAYS).sort((a, b) => b.days - a.days));
      setProps(((pr.data ?? []) as { id: string; title: string; reference: string; info_confirmed_at: string | null }[])
        .map(x => ({ id: x.id, title: x.title, reference: x.reference, days: daysSince(x.info_confirmed_at) ?? 0 }))
        .filter(x => x.days > PROP_DAYS).sort((a, b) => b.days - a.days));
      setRent(ra); setRepairs(rp);
      setError(null);
    } catch (e) { setError(friendly(e)); }
  }, [office.id, canWrite]);
  // Once per visit: make a task for every mandate that ends soon or has ended (idempotent). Never blocks the screen:
  // when the database function is not installed yet, or fails, Today simply loads as before.
  useEffect(() => {
    let live = true;
    (async () => {
      if (canWrite) {
        try { await supabase.rpc('sync_mandate_tasks', { p_org: office.id, p_label: t('Renew mandate') }); } catch { /* ignore */ }
      }
      if (live) load();
    })();
    return () => { live = false; };
  }, [load, canWrite, office.id]);

  const toggle = async (x: TaskView) => {
    setBusyId(x.task.id); setError(null);
    const err = await toggleTask(x.task);
    setBusyId(null);
    if (err) setError(t(err)); else load();
  };

  const today = todayStr();
  const due = (tasks ?? []).filter(x => x.task.status === 'open' && x.task.due_date !== null && x.task.due_date <= today);
  const upcoming = (viewings ?? [])
    .filter(x => x.v.status === 'scheduled' && daysUntil(toInputValue(new Date(x.v.scheduled_at)).slice(0, 10)) <= AHEAD_DAYS)
    .sort((a, b) => a.v.scheduled_at.localeCompare(b.v.scheduled_at));
  const editing = tasks?.find(x => x.task.id === editId)?.task;

  const viewing = viewings?.find(x => x.v.id === viewId);
  const loading = tasks === null || viewings === null || leads === null || props === null || rent === null || repairs === null;
  const dateLine = new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'full' }).format(new Date());
  const quiet = !loading && matchCount === 0 && adCount === 0 && payCount === 0 && due.length === 0 && upcoming.length === 0 && leads.length === 0 && props.length === 0 && rent.length === 0 && repairs.length === 0;

  // The one thing to do now: a viewing today first, then a task that is due, a lead to call back, rent that is overdue, the next viewing.
  const telHref = (n: string) => `tel:${n.replace(/\s/g, '')}`;
  const timeText = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const dayTime = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const contactActions = (c: { phone: string | null; whatsapp: string | null } | undefined, name: string, primaryFallback: ReactNode) => {
    const phone = c?.phone?.trim() || null;
    const wa = c?.whatsapp?.trim() || phone;
    const first = name.trim().split(/\s+/)[0] ?? '';
    return (
      <>
        {phone ? <a href={telHref(phone)} className={nextPrimary}><Phone className="h-4 w-4" />{t('Call {name}', { name: first })}</a> : primaryFallback}
        {wa && <a href={waLink(wa)} target="_blank" rel="noreferrer" aria-label={t('WhatsApp')} title={t('WhatsApp')} className={nextRound}><MessageCircle className="h-5 w-5" /></a>}
      </>
    );
  };
  const nextCard = (() => {
    if (loading) return null;
    const dayOf = (iso: string) => toInputValue(new Date(iso)).slice(0, 10);
    const vToday = upcoming.find(x => dayOf(x.v.scheduled_at) === today);
    const open = (id: string) => () => setViewId(id);
    const viewingCard = (x: ViewingView, today0: boolean) => (
      <NextUp key="v" eyebrow={today0 ? t('Viewing today') : t('Next viewing')} when={today0 ? timeText(x.v.scheduled_at) : dayTime(x.v.scheduled_at)}
        warn={new Date(x.v.scheduled_at).getTime() < Date.now()} title={x.person?.full_name ?? '…'} sub={x.property?.title} onOpen={open(x.v.id)}
        actions={contactActions(x.person, x.person?.full_name ?? '', <button type="button" onClick={open(x.v.id)} className={nextPrimary}>{t('Open')}</button>)} />
    );
    if (vToday) return viewingCard(vToday, true);
    const task = due[0];
    if (task) {
      const late = task.task.due_date !== null && daysUntil(task.task.due_date) < 0;
      return (
        <NextUp eyebrow={t('Up next')} title={task.task.title} warn={late} onOpen={() => canWrite && setEditId(task.task.id)}
          sub={[task.task.due_date ? dueText(task.task.due_date) : null, task.leadName, task.propertyTitle].filter(Boolean).join(' · ')}
          actions={canWrite ? <button type="button" disabled={busyId === task.task.id} onClick={() => toggle(task)} className={nextPrimary}><Check className="h-4 w-4" strokeWidth={3} />{t('Mark as done')}</button> : undefined} />
      );
    }
    const lead = (leads ?? [])[0];
    if (lead) {
      return (
        <NextUp eyebrow={t('Leads to call back')} title={lead.name} sub={t('{n} days without contact', { n: lead.days })} onOpen={() => onGo('leads')}
          actions={contactActions(lead, lead.name, <button type="button" onClick={() => onGo('leads')} className={nextPrimary}>{t('Open')}</button>)} />
      );
    }
    const r = (rent ?? [])[0];
    if (r) {
      return (
        <NextUp eyebrow={t('Rent overdue')} when={formatMad(r.cents)} warn title={r.name} sub={r.property} onOpen={() => onGo('leases')}
          actions={<button type="button" onClick={() => onGo('leases')} className={nextPrimary}>{t('Open')}</button>} />
      );
    }
    const v = upcoming[0];
    return v ? viewingCard(v, false) : null;
  })();

  const big = bigDay(new Date());
  const rentTotal = (rent ?? []).reduce((n, x) => n + x.cents, 0);
  const share = () => window.open(whatsappShareUrl(briefingText({ office: office.name, date: dateLine, due, viewings: upcoming, leadsToCall: leads?.length ?? 0, rent: (rent ?? []).map(x => `${x.name} · ${x.property} — ${formatMad(x.cents)}`), repairs: (repairs ?? []).map(x => `${x.title} · ${x.property}`) })), '_blank', 'noopener');

  return (
    <>
    <Hero
      eyebrow={dateLine.split(' ').slice(1).join(' ')}
      title={big.weekday}
      sub={loading ? undefined : quiet ? t('All clear') : undefined}
      action={!loading && !quiet ? (
        <button type="button" onClick={share} aria-label={t('Share briefing')} title={t('Share briefing')}
          className="grid h-11 w-11 place-items-center rounded-full bg-night-2 text-white ring-1 ring-white/20 transition active:scale-90"><MessageCircle className="h-5 w-5" /></button>
      ) : undefined}
      stats={[
        { value: loading ? '–' : due.length, label: t('Tasks due'), warn: !loading && due.length > 0 },
        { value: loading ? '–' : upcoming.length, label: t('Viewings this week') },
        { value: loading ? '–' : madShort(rentTotal), label: t('Rent overdue'), warn: !loading && rentTotal > 0 },
      ]}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex flex-wrap items-start justify-between gap-3 max-lg:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Today')}</h1>
          <p className="text-sm text-muted">{dateLine}</p>
        </div>
        {!loading && !quiet && (
          <button type="button" onClick={share}
            className="inline-flex items-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2">
            <MessageCircle className="h-4 w-4 text-ok" /> {t('Share briefing')}
          </button>
        )}
      </div>

      {nextCard}

      <GettingStarted office={office} onGo={onGo} />

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {loading && !error && (
        <div className="mt-6 space-y-8" aria-hidden="true">
          {[0, 1].map(i => (
            <div key={i}>
              <div className="skeleton mb-3 h-6 w-1/3 rounded-lg" />
              <div className="space-y-2">
                <div className="skeleton h-14 w-full rounded-2xl" />
                <div className="skeleton h-14 w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {quiet && <Card className="mt-6 text-center"><p className="font-display text-xl font-bold">{t('All clear')}</p><p className="mt-1 text-sm text-muted">{t('No tasks due, no viewings this week, nobody waiting for a call.')}</p></Card>}

      {!loading && (
        <div className="mt-6 space-y-8">
          <NewMatches office={office} onGo={onGo} onCount={setMatchCount} />
          <StaleAds office={office} onGo={onGo} onCount={setAdCount} />
          <WeakAds office={office} onGo={onGo} />
          <PayoutsDue office={office} onGo={onGo} onCount={setPayCount} />
          {due.length > 0 && (
            <Block title={t('Tasks due')} count={due.length} to="tasks" onGo={onGo}>
              <ul className="space-y-2">
                {due.map(x => <TaskItem key={x.task.id} item={x} canWrite={canWrite} busy={busyId === x.task.id} onToggle={() => toggle(x)} onOpen={() => canWrite && setEditId(x.task.id)} />)}
              </ul>
              {due.some(x => x.task.assigned_to === userId) && due.some(x => x.task.assigned_to !== userId) && (
                <p className="mt-2 text-xs text-muted">{t('{n} of these are yours.', { n: due.filter(x => x.task.assigned_to === userId).length })}</p>
              )}
            </Block>
          )}

          {upcoming.length > 0 && (
            <Block title={t('Viewings this week')} count={upcoming.length} to="viewings" onGo={onGo}>
              <ul className="space-y-2">
                {upcoming.map(x => {
                  const late = new Date(x.v.scheduled_at).getTime() < Date.now();
                  return (
                    <li key={x.v.id}>
                      <button type="button" onClick={() => setViewId(x.v.id)} className="block w-full lift rounded-2xl bg-surface px-3.5 py-3 text-start transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`tabular text-sm font-semibold ${late ? 'text-warn' : ''}`}>{whenText(x.v.scheduled_at)}</p>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${viewingStatusCls[x.v.status]}`}>{viewingStatusLabel(x.v.status)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted">{x.person?.full_name ?? '…'} · {x.property?.title ?? '…'}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Block>
          )}

          {rent.length > 0 && (
            <Block title={t('Rent overdue')} count={rent.length} to="leases" onGo={onGo}>
              <ul className="space-y-2">
                {rent.slice(0, 6).map(x => (
                  <li key={x.id} className="flex items-center justify-between gap-3 lift rounded-2xl bg-surface px-3.5 py-3">
                    <p className="min-w-0 truncate text-sm font-semibold">{x.name} <span className="font-normal text-muted">· {x.property}</span></p>
                    <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-danger">
                      <span className="tabular">{formatMad(x.cents)}</span>
                      <span>{x.days === 1 ? t('Overdue by 1 day') : t('Overdue by {n} days', { n: x.days })}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {rent.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: rent.length - 6 })}</p>}
            </Block>
          )}

          {repairs.length > 0 && (
            <Block title={t('Repairs that need attention')} count={repairs.length} to="maintenance" onGo={onGo}>
              <ul className="space-y-2">
                {repairs.slice(0, 6).map(x => (
                  <li key={x.id} className="flex items-center justify-between gap-3 lift rounded-2xl bg-surface px-3.5 py-3">
                    <p className="min-w-0 truncate text-sm font-semibold">{x.title} <span className="font-normal text-muted">· {x.property}</span></p>
                    <span className={`shrink-0 text-xs font-semibold ${x.urgent ? 'text-danger' : 'text-warn'}`}>
                      {x.urgent ? t('Urgent') : x.days === 1 ? t('Open for 1 day') : t('Open for {n} days', { n: x.days })}
                    </span>
                  </li>
                ))}
              </ul>
              {repairs.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: repairs.length - 6 })}</p>}
            </Block>
          )}

          {leads.length > 0 && (
            <Block title={t('Leads to call back')} count={leads.length} to="leads" onGo={onGo}>
              <ul className="space-y-2">
                {leads.slice(0, 6).map(x => (
                  <li key={x.lead.id} className="flex items-center justify-between gap-3 lift rounded-2xl bg-surface px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{x.name}</span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${leadStatusCls[x.lead.status]}`}>{leadStatusLabel(x.lead.status)}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-warn">{t('{n} days without contact', { n: x.days })}</p>
                    </div>
                    <QuickIcons c={x} />
                  </li>
                ))}
              </ul>
              {leads.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: leads.length - 6 })}</p>}
            </Block>
          )}

          {props.length > 0 && (
            <Block title={t('Check price and availability')} count={props.length} to="properties" onGo={onGo}>
              <ul className="space-y-2">
                {props.slice(0, 6).map(x => (
                  <li key={x.id} className="flex items-center justify-between gap-3 lift rounded-2xl bg-surface px-3.5 py-3">
                    <p className="truncate text-sm font-semibold">{x.title} <span className="tabular font-normal text-muted">· {x.reference}</span></p>
                    <span className="shrink-0 text-xs font-semibold text-warn">{t('Confirmed {n} days ago', { n: x.days })}</span>
                  </li>
                ))}
              </ul>
              {props.length > 6 && <p className="mt-2 text-xs text-muted">{t('And {n} more.', { n: props.length - 6 })}</p>}
            </Block>
          )}
        </div>
      )}

      {editing && <TaskForm key={editing.id} orgId={office.id} userId={userId} task={editing} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
      {viewing && <ViewingDetail key={viewing.v.id} office={office} item={viewing} onChanged={load} onClose={() => setViewId(null)} />}
    </div>
    </PhoneSheet>
    </>
  );
}
