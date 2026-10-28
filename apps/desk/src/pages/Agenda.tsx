import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, FileSignature, KeyRound, ListChecks, Plus, Wallet } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { addDays, dayKey, dayLabel, loadAgenda, weekLabel, weekStart, type AgendaItem } from '../lib/agenda';
import { viewingStatusCls, viewingStatusLabel } from '../lib/labels';
import { toggleTask } from '../lib/tasks';
import { Btn, Card } from '../components/ui';
import { TaskForm } from './TaskForm';
import { ViewingForm } from './ViewingForm';
import { ViewingDetail } from './ViewingDetail';
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

/** The week at a glance: viewings, deadlines, mandates and leases that end, and rent that is due. */
export function Agenda({ office, userId, onGo }: { office: Office; userId: string; onGo: (v: View) => void }) {
  const canWrite = office.role !== 'viewer';
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [mine, setMine] = useState(false);
  const [openViewing, setOpenViewing] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const base = 'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-start text-sm transition hover:ring-2 hover:ring-brand/25';
    const icon = <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${TONE[it.kind]}`}>{ICON[it.kind]}</span>;
    switch (it.kind) {
      case 'viewing': {
        const { v, person, property } = it.item;
        const late = v.status === 'scheduled' && new Date(v.scheduled_at).getTime() < Date.now();
        return (
          <button key={`v${v.id}`} type="button" onClick={() => setOpenViewing(v.id)} className={`${base} bg-surface`}>
            {icon}
            <span className="min-w-0 flex-1">
              <span className={`tabular block text-xs font-bold ${late ? 'text-warn' : 'text-brand'}`}>{it.time} · {t('Viewing')}</span>
              <span className="block line-clamp-2 break-words font-semibold">{person?.full_name ?? '…'}</span>
              <span className="block truncate text-xs text-muted">{property?.title ?? '…'}</span>
              {v.status !== 'scheduled' && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${viewingStatusCls[v.status]}`}>{viewingStatusLabel(v.status)}</span>}
            </span>
          </button>
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
          <button key={`l${it.lease.l.id}`} type="button" onClick={() => onGo('leases')} className={`${base} bg-surface`}>
            {icon}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-warn">{t('Lease ends')}</span>
              <span className="block line-clamp-2 break-words font-semibold">{it.lease.person?.full_name ?? '…'}</span>
              <span className="block truncate text-xs text-muted">{it.lease.property?.title ?? '…'}</span>
            </span>
          </button>
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Agenda')}</h1>
          <p className="text-sm text-muted">{weekLabel(start)} · {t('{n} items', { n: weekCount })}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setAdding({ kind: 'task', day: today })}><ListChecks className="h-4 w-4" /> {t('Add a task')}</Btn>
            <Btn tone="brand" onClick={() => setAdding({ kind: 'viewing', day: dayKey(addDays(new Date(), 1)) })}><CalendarPlus className="h-4 w-4" /> {t('Schedule a viewing')}</Btn>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setStart(s => addDays(s, -7))} aria-label={t('Previous week')}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
          <button type="button" onClick={() => setStart(weekStart(new Date()))}
            className="rounded-full bg-surface px-3.5 py-1.5 text-sm font-semibold ring-1 ring-line/10 hover:text-brand">{t('This week')}</button>
          <button type="button" onClick={() => setStart(s => addDays(s, 7))} aria-label={t('Next week')}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
        </div>
        <button type="button" aria-pressed={mine} onClick={() => setMine(m => !m)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition sm:ms-auto ${mine ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{t('Only my tasks')}</button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {items === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {items !== null && (
        <>
          {items.length === 0 && (
            <Card className="mt-6 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><CalendarDays className="h-6 w-6" /></span>
              <h2 className="font-display mt-3 text-xl font-bold">{t('Your agenda is empty')}</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Viewings, tasks with a deadline, mandates and leases that end, and rent that is due appear here by themselves.')}</p>
            </Card>
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-7">
            {days.map(d => {
              const key = dayKey(d);
              const list = byDay.get(key) ?? [];
              const { weekday, date } = dayLabel(d);
              const isToday = key === today;
              return (
                <section key={key} className={`card flex min-h-[7rem] flex-col rounded-2xl p-2.5 ${isToday ? 'ring-2 ring-brand' : ''} ${list.length === 0 ? 'max-lg:min-h-0' : ''}`}>
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
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {(['viewing', 'task', 'rent', 'mandate', 'lease_end'] as const).map(k => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`grid h-5 w-5 place-items-center rounded-md ${TONE[k]}`}>{ICON[k]}</span>
                {k === 'viewing' ? t('Viewing') : k === 'task' ? t('Task') : k === 'rent' ? t('Rent') : k === 'mandate' ? t('Mandate') : t('Lease ends')}
              </span>
            ))}
          </p>
        </>
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
  );
}
