import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Search } from 'lucide-react';
import type { TaskStatus } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadTasks, sortTasks, toggleTask, type TaskView } from '../lib/tasks';
import { TASK_STATUSES, taskStatusLabel } from '../lib/labels';
import { Btn, Card, inputCls } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { TaskForm } from './TaskForm';

type Filter = 'all' | TaskStatus;

export function Tasks({ office, userId }: { office: Office; userId: string }) {
  const [rows, setRows] = useState<TaskView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    try { const r = await loadTasks(office.id); setError(null); setRows(sortTasks(r.tasks)); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.task.status] = (c[r.task.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (filter === 'all' || r.task.status === filter) &&
      (!mine || r.task.assigned_to === userId) &&
      (!needle || [r.task.title, r.task.notes, r.assignee, r.leadName, r.propertyTitle].some(x => x?.toLowerCase().includes(needle))));
  }, [rows, filter, mine, q, userId]);

  const toggle = async (x: TaskView) => {
    setBusyId(x.task.id); setError(null);
    const err = await toggleTask(x.task);
    setBusyId(null);
    if (err) setError(t(err)); else load();
  };

  const tabs: Filter[] = ['all', ...TASK_STATUSES.filter(s => (counts[s] ?? 0) > 0 || s === 'open')];
  const editing = rows?.find(x => x.task.id === editId)?.task;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Tasks')}</h1>
          <p className="text-sm text-muted">{t('{n} open', { n: counts.open ?? 0 })}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add task')}</Btn>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><ListChecks className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No tasks yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Write down what has to happen, give it a deadline and a person, and tick it off when it is done.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add your first task')}</Btn>}
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : taskStatusLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
                </button>
              ))}
              <button type="button" aria-pressed={mine} onClick={() => setMine(m => !m)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${mine ? 'bg-brand text-brand-ink' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                {t('Only mine')}
              </button>
            </div>
            <div className="relative sm:ms-auto sm:w-56">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} ps-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
            </div>
          </div>

          {shown.length === 0
            ? <p className="mt-10 text-center text-muted">{filter === 'open' && !q && !mine ? t('Nothing left to do.') : t('Nothing matches.')}</p>
            : <ul className="mt-4 space-y-2">{shown.map(x => <TaskItem key={x.task.id} item={x} canWrite={canWrite} busy={busyId === x.task.id} onToggle={() => toggle(x)} onOpen={() => canWrite && setEditId(x.task.id)} />)}</ul>}
        </>
      )}

      {adding && <TaskForm orgId={office.id} userId={userId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {editing && <TaskForm key={editing.id} orgId={office.id} userId={userId} task={editing} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
    </div>
  );
}
