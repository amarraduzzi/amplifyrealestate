import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, FileSignature, KeyRound, ListChecks, Plus, Wallet } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { addDays, dayKey, dayLabel, loadAgenda, weekLabel, weekStart, type AgendaItem } from '../lib/agenda';
import { viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { toggleTask } from '../lib/tasks';
import { Btn, Card } from '../components/ui';
import { BarsMotif, Hero, PhoneSheet, bigDay } from '../components/Hero';
import { QuickIcons } from '../components/QuickActions';
import { TaskForm } from './TaskForm';
import { ViewingForm } from './ViewingForm';
import { ViewingDetail } from './ViewingDetail';
import { Tasks } from './Tasks';
import type { View } from '../components/Shell';
import { friendly } from '../lib/errors';

type Adding = { kind: 'viewing' | 'task'; day: string } | null;

const ICON: Record<AgendaItem['kind'], ReactNode> = {
  viewing: <CalendarClock className="h-3.5 w-3.5" />,
  task: <ListChecks className="h-3.5 w-3.5" />,
  mandate: <FileSignature className="h-3.5 w-3.5" />,
  rent: <Wallet className="h-3.5 w-3.5" />,
  lease_end: <KeyRound className="h-3.5 w-3.5" />,
};
const TONE: Record<AgendaItem['kind'], string> = {
  viewing: 'bg-brand/10 text-brand',
  task: 'bg-surface-2 text-ink',
  mandate: 'bg-warn/10 text-warn',
  rent: 'bg-ok/10 text-ok',
  lease_end: 'bg-warn/10 text-warn',
};

const BAR: Record<AgendaItem['kind'], string> = {
  viewing: 'border-brand', task: 'border-ink/25', mandate: 'border-warn', rent: 'border-ok', lease_end: 'border-warn',
};

/** The week at a glance: viewings, deadlines, mandates and leases that end, and rent that is due. */
function AgendaTabs({ tab, onTab, onDark = false }: { tab: 'week' | 'tasks'; onTab: (t: 'week' | 'tasks') => void; onDark?: boolean }) {
  return (
    <div className={`inline-flex rounded-full p-1 ${onDark ? 'bg-white/10 ring-1 ring-white/10' : 'mt-3 bg-surface ring-1 ring-line/10'}`} role="tablist">
      {(['week', 'tasks'] as const).map(x => (
        <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => onTab(x)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${onDark ? (tab === x ? 'bg-white text-night' : 'text-white/70') : (tab === x ? 'bg-ink text-bg' : 'text-muted hover:text-ink')}`}>
          {x === 'week' ? t('Week') : t('Tasks')}
        </button>
      ))}
    </div>
  );
}

/** The Agenda tab: the week at a glance, or the full task list. */
export function Agenda({ office, userId, onGo, initialTab = 'week' }: { office: Office; userId: string; onGo: (v: View) => void; initialTab?: 'week' | 'tasks' }) {
  const [tab, setTab] = useState<'week' | 'tasks'>(initialTab);
  if (tab === 'tasks') {
    return (
      <>
        <Hero title={t('Tasks')} action={<AgendaTabs tab={tab} onTab={setTab} onDark />} />
        <PhoneSheet>
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
            <div className="max-lg:hidden">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Agenda')}</h1>
              <AgendaTabs tab={tab} onTab={setTab} />
            </div>
            <Tasks office={office} userId={userId} embedded />
          </div>
        </PhoneSheet>
      </>
    );
  }
  return <AgendaWeek office={office} userId={userId} onGo={onGo} tabs={<AgendaTabs tab={tab} onTab={setTab} />} darkTabs={<AgendaTabs tab={tab} onTab={setTab} onDark />} />;
}

function AgendaWeek({ office, userId, onGo, tabs, darkTabs }: { office: Office; userId: string; onGo: (v: View) => void; tabs: ReactNode; darkTabs: ReactNode }) {
  const canWrite = office.role !== 'viewer';
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [mine, setMine] = useState(false);
  const [openViewing, setOpenViewing] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sel, setSel] = useState(() => dayKey(new Date()));

  const load = useCallback(async () => {
    try { setItems((await loadAgenda(office.id, canWrite)).items); setError(null); }
    catch (e) { setError(friendly(e)); }
  }, [office.id, canWrite]);
  useEffect(() => { load(); }, [load]);

  const today = dayKey(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const it of items ?? []) {
      if (mine && it.kind === 'task' && it.item.task.assigned_to !== userId) continue;
      const list = m.get(it.day);
      if (list) list.push(it); else m.set(it.day, [it]);
    }
    return m;
  }, [items, mine, userId]);

  const weekCount = days.reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0);
  // phone: one day at a time. A day outside the shown week falls back to its first day.
  const selKey = days.some(d => dayKey(d) === sel) ? sel : dayKey(days[0]);
  const selDate = days.find(d => dayKey(d) === selKey) ?? days[0];
  const selList = byDay.get(selKey) ?? [];
  const weekItems = days.flatMap(d => byDay.get(dayKey(d)) ?? []);
  const nViewings = weekItems.filter(x => x.kind === 'viewing' && x.item.v.status === 'scheduled').length;
  const nTasks = weekItems.filter(x => x.kind === 'task' && x.item.task.status === 'open').length;
  const rentCents = weekItems.reduce((n, x) => n + (x.kind === 'rent' ? x.payment.amount_cents : 0), 0);
  const big = bigDay(selDate);
  const isCurrentWeek = dayKey(start) === dayKey(weekStart(new Date()));

  const tick = async (id: string) => {
    const it = items?.find(x => x.kind === 'task' && x.item.task.id === id);
    if (!it || it.kind !== 'task' || busyId) return;
    setBusyId(id);
    const err = await toggleTask(it.item.task);
    setBusyId(null);
    if (err) setError(t(err)); else load();
  };

  const viewing = items?.find(x => x.kind === 'viewing' && x.item.v.id === openViewing);
  const task = items?.find(x => x.kind === 'task' && x.item.task.id === openTask);

  const line = (it: AgendaItem) => {
    const base = `lift flex w-full items-start gap-2 rounded-2xl border-s-4 ${BAR[it.kind]} px-2.5 py-2.5 text-start text-sm transition active:scale-[.985] hover:ring-2 hover:ring-brand/25`;
    const icon = <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${TONE[it.kind]}`}>{ICON[it.kind]}</span>;
    switch (it.kind) {
      case 'viewing': {
        const { v, person, property } = it.item;
        const late = v.status === 'scheduled' && new Date(v.scheduled_at).getTime() < Date.now();
        return (
          <div key={`v${v.id}`} className={`${base} bg-surface`}>
            {icon}
            <button type="button" onClick={() => setOpenViewing(v.id)} className="min-w-0 flex-1 text-start">
              <span className={`tabular block text-xs font-bold ${late ? 'text-warn' : 'text-brand'}`}>{it.time} · {t('Viewing')}</span>
              <span className="block line-clamp-2 break-words font-semibold">{person?.full_name ?? '…'}</span>
              <span className="block truncate text-xs text-muted">{property?.title ?? '…'}</span>
              {v.status !== 'scheduled' && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${viewingStatusCls[v.status]}`}>{viewingStatusLabel(v.status)}</span>}
            </button>
            {v.status === 'scheduled' && person && <QuickIcons c={person} />}
          </div>
        );
      }
      case 'task': {
        const { task: tk, leadName, propertyTitle } = it.item;
        const done = tk.status === 'done';
        const late = !done && tk.due_date! < today;
        return (
          <div key={`t${tk.id}`} className={`${base} bg-surface`}>
            <button type="button" disabled={!canWrite || busyId === tk.id} onClick={() => tick(tk.id)}
              aria-label={done ? t('Open again') : t('Mark as done')}
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 transition ${done ? 'bg-ok text-white ring-ok' : 'bg-surface ring-line/20 hover:ring-ok'} disabled:opacity-50`}>
              {done && <Check className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => setOpenTask(tk.id)} className="min-w-0 flex-1 text-start">
              <span className={`block text-xs font-bold ${late ? 'text-warn' : 'text-muted'}`}>{late ? t('Overdue') : t('Task')}</span>
              <span className={`block line-clamp-2 break-words font-semibold ${done ? 'text-muted line-through' : ''}`}>{tk.title}</span>
              {(leadName || propertyTitle) && <span className="block truncate text-xs text-muted">{leadName ?? propertyTitle}</span>}
            </button>
          </div>
        );
      }
      case 'mandate':
        return (
          <button key={`m${it.propertyId}`} type="button" onClick={() => onGo('properties')} className={`${base} bg-surface`}>
            {icon}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-warn">{it.day < today ? t('Mandate expired') : t('Mandate ends')}</span>
              <span className="block line-clamp-2 break-words font-semibold">{it.title}</span>
              <span className="block truncate text-xs text-muted">{it.reference}</span>
            </span>
          </button>
        );
      case 'rent': {
        const late = it.day < today;
        return (
          <button key={`r${it.payment.id}`} type="button" onClick={() => onGo('leases')} className={`${base} bg-surface`}>
            {icon}
            <span className="min-w-0 flex-1">
              <span className={`tabular block text-xs font-bold ${late ? 'text-danger' : 'text-ok'}`}>{late ? t('Rent overdue') : t('Rent due')} · {formatMad(it.payment.amount_cents)}</span>
              <span className="block line-clamp-2 break-words font-semibold">{it.tenant}</span>
              <span className="block truncate text-xs text-muted">{it.title}</span>
            </span>
          </button>
        );
      }
      case 'lease_end':
        return (
          <div key={`l${it.lease.l.id}`} className={`${base} bg-surface`}>
            {icon}
            <button type="button" onClick={() => onGo('leases')} className="min-w-0 flex-1 text-start">
              <span className="block text-xs font-bold text-warn">{t('Lease ends')}</span>
              <span className="block line-clamp-2 break-words font-semibold">{it.lease.person?.full_name ?? '…'}</span>
              <span className="block truncate text-xs text-muted">{it.lease.property?.title ?? '…'}</span>
            </button>
            {it.lease.person && <QuickIcons c={it.lease.person} />}
          </div>
        );
    }
  };

  const hero = (
    <Hero
      eyebrow={
        <button type="button" onClick={() => { setStart(weekStart(new Date())); setSel(today); }} className="inline-flex items-center gap-1.5 uppercase">
          {weekLabel(start)}{!isCurrentWeek && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] normal-case tracking-normal">{t('This week')}</span>}
        </button>
      }
      title={big.weekday}
      sub={`${big.date} · ${selList.length === 0 ? t('Nothing planned') : t('{n} items', { n: selList.length })}`}
      action={darkTabs}
      stats={[
        { value: items === null ? '–' : nViewings, label: t('Viewings') },
        { value: items === null ? '–' : nTasks, label: t('Tasks') },
        { value: items === null ? '–' : formatMad(rentCents), label: t('Rent due'), warn: rentCents > 0 && days.some(d => dayKey(d) < today) },
      ]}
    >
      <div className="mt-4 flex items-center gap-1">
        <button type="button" onClick={() => setStart(s => addDays(s, -7))} aria-label={t('Previous week')}
          className="grid h-9 w-7 shrink-0 place-items-center rounded-full text-white/70 active:scale-90"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {days.map(d => {
            const key = dayKey(d);
            const on = key === selKey;
            const has = (byDay.get(key)?.length ?? 0) > 0;
            return (
              <button key={key} type="button" aria-pressed={on} onClick={() => setSel(key)}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-2 transition active:scale-95 ${on ? 'bg-white text-night' : 'text-white/85'} ${key === today && !on ? 'ring-1 ring-brand-hi/70' : ''}`}>
                <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wide opacity-70">{dayLabel(d).weekday}</span>
                <span className="tabular font-display text-base font-bold leading-none">{d.getDate()}</span>
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${has ? (on ? 'bg-brand' : 'bg-brand-hi') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setStart(s => addDays(s, 7))} aria-label={t('Next week')}
          className="grid h-9 w-7 shrink-0 place-items-center rounded-full text-white/70 active:scale-90"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></button>
      </div>
    </Hero>
  );

  return (
    <>
    {hero}
    <PhoneSheet>
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3 max-lg:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Agenda')}</h1>
          <p className="text-sm text-muted">{weekLabel(start)} · {t('{n} items', { n: weekCount })}</p>
          {tabs}
        </div>
        {canWrite && (
          <div className="hidden flex-wrap gap-2 sm:flex">
            <Btn onClick={() => setAdding({ kind: 'task', day: today })}><ListChecks className="h-4 w-4" /> {t('Add a task')}</Btn>
            <Btn tone="brand" onClick={() => setAdding({ kind: 'viewing', day: dayKey(addDays(new Date(), 1)) })}><CalendarPlus className="h-4 w-4" /> {t('Schedule a viewing')}</Btn>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 max-lg:mt-4">
        <p className="min-w-0 truncate text-sm font-semibold text-muted lg:hidden">{big.weekday} {big.date}</p>
        <div className="flex shrink-0 items-center gap-1 max-lg:hidden">
          <button type="button" onClick={() => setStart(s => addDays(s, -7))} aria-label={t('Previous week')}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
          <button type="button" onClick={() => setStart(weekStart(new Date()))}
            className="rounded-full bg-surface px-3.5 py-1.5 text-sm font-semibold ring-1 ring-line/10 hover:text-brand">{t('This week')}</button>
          <button type="button" onClick={() => setStart(s => addDays(s, 7))} aria-label={t('Next week')}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
        </div>
        <button type="button" aria-pressed={mine} onClick={() => setMine(m => !m)}
          className={`ms-auto truncate rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95 ${mine ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{t('Only my tasks')}</button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {items === null && !error && (
        <div className="mt-4 grid gap-3 lg:grid-cols-7" aria-hidden="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="card rounded-3xl p-3 lg:min-h-[7rem]">
              <div className="skeleton h-4 w-1/3 rounded-lg" />
              <div className="skeleton mt-3 h-14 w-full rounded-2xl" />
              {i % 2 === 0 && <div className="skeleton mt-2 h-14 w-full rounded-2xl" />}
            </div>
          ))}
        </div>
      )}

      {items !== null && (
        <>
          {items.length === 0 && (
            <Card className="mt-6 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><CalendarDays className="h-6 w-6" /></span>
              <h2 className="font-display mt-3 text-xl font-bold">{t('Your agenda is empty')}</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Viewings, tasks with a deadline, mandates and leases that end, and rent that is due appear here by themselves.')}</p>
            </Card>
          )}
          <div className="mt-3 space-y-2 lg:hidden">
            {selList.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line/20 px-4 py-9 text-center">
                <BarsMotif tone="light" className="mx-auto h-10 w-12" />
                <p className="font-display mt-3 text-lg font-bold">{t('Nothing planned')}</p>
                {canWrite && (
                  <div className="mt-4 flex justify-center gap-2">
                    <button type="button" onClick={() => setAdding({ kind: 'viewing', day: selKey })} className="rounded-xl bg-brand/10 px-3.5 py-2 text-sm font-semibold text-brand active:scale-95">{t('Viewing')}</button>
                    <button type="button" onClick={() => setAdding({ kind: 'task', day: selKey })} className="rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-line/10 active:scale-95">{t('Task')}</button>
                  </div>
                )}
              </div>
            ) : selList.map(line)}
          </div>
          <div className="mt-4 hidden gap-3 lg:grid lg:grid-cols-7">
            {days.map(d => {
              const key = dayKey(d);
              const list = byDay.get(key) ?? [];
              const { weekday, date } = dayLabel(d);
              const isToday = key === today;
              return (
                <section key={key} className={`card rise flex min-h-[7rem] flex-col rounded-3xl p-3 ${isToday ? 'ring-2 ring-brand' : ''}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-1 px-1">
                    <p className="text-sm">
                      <span className={`font-bold capitalize ${isToday ? 'text-brand' : ''}`}>{weekday}</span>{' '}
                      <span className="tabular text-muted">{date}</span>
                    </p>
                    {canWrite && (
                      <button type="button" onClick={() => setPicking(p => (p === key ? null : key))} aria-label={t('Add')}
                        className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-brand"><Plus className="h-4 w-4" /></button>
                    )}
                  </div>
                  {picking === key && (
                    <div className="mb-2 flex flex-wrap gap-1 px-1">
                      <button type="button" onClick={() => { setPicking(null); setAdding({ kind: 'viewing', day: key }); }}
                        className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">{t('Viewing')}</button>
                      <button type="button" onClick={() => { setPicking(null); setAdding({ kind: 'task', day: key }); }}
                        className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold">{t('Task')}</button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {list.length === 0
                      ? <p className="px-1 text-xs text-muted/70">{t('Nothing planned')}</p>
                      : list.map(line)}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="mt-4 flex-wrap gap-x-4 gap-y-1 text-xs text-muted max-lg:hidden lg:flex">
            {(['viewing', 'task', 'rent', 'mandate', 'lease_end'] as const).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`grid h-5 w-5 place-items-center rounded-md ${TONE[k]}`}>{ICON[k]}</span>
                {k === 'viewing' ? t('Viewing') : k === 'task' ? t('Task') : k === 'rent' ? t('Rent') : k === 'mandate' ? t('Mandate') : t('Lease ends')}
              </span>
            ))}
          </p>
        </>
      )}

      {canWrite && items !== null && !viewing && !task && !adding && (
        <div className="fixed end-4 z-20 flex flex-col items-end gap-2 sm:hidden" style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}>
          {fabOpen && (
            <>
              <button type="button" onClick={() => { setFabOpen(false); setAdding({ kind: 'viewing', day: dayKey(addDays(new Date(), 1)) }); }}
                className="rise inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold shadow-lg ring-1 ring-line/10 transition active:scale-95">
                <CalendarPlus className="h-4 w-4 text-brand" />{t('Schedule a viewing')}
              </button>
              <button type="button" onClick={() => { setFabOpen(false); setAdding({ kind: 'task', day: today }); }}
                className="rise inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold shadow-lg ring-1 ring-line/10 transition active:scale-95">
                <ListChecks className="h-4 w-4 text-brand" />{t('Add a task')}
              </button>
            </>
          )}
          <button type="button" onClick={() => setFabOpen(o => !o)} aria-expanded={fabOpen} aria-label={t('Add')} title={t('Add')}
            className="gold-fill grid h-14 w-14 place-items-center rounded-full text-brand-ink transition active:scale-90">
            <Plus className={`h-6 w-6 transition-transform ${fabOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>
      )}

      {viewing && viewing.kind === 'viewing' && (
        <ViewingDetail key={viewing.item.v.id} office={office} item={viewing.item} onChanged={load} onClose={() => setOpenViewing(null)} />
      )}
      {task && task.kind === 'task' && (
        <TaskForm key={task.item.task.id} orgId={office.id} userId={userId} task={task.item.task}
          onClose={() => setOpenTask(null)} onSaved={() => { setOpenTask(null); load(); }} />
      )}
      {adding?.kind === 'viewing' && (
        <ViewingForm orgId={office.id} defaultWhen={`${adding.day}T10:00`} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load(); }} />
      )}
      {adding?.kind === 'task' && (
        <TaskForm orgId={office.id} userId={userId} defaultDue={adding.day} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load(); }} />
      )}
    </div>
    </PhoneSheet>
    </>
  );
}
