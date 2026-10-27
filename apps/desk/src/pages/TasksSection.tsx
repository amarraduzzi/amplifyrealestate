import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PropertyRow } from '../lib/types';
import { loadTasks, sortTasks, toggleTask, type TaskView } from '../lib/tasks';
import { Btn } from '../components/ui';
import { TaskItem } from '../components/TaskItem';
import { TaskForm } from './TaskForm';

/** The tasks of one lead or one property, with a button to add one. Used inside the lead and property screens. */
export function TasksSection({ office, userId, lead, property }: { office: Office; userId: string; lead?: LeadRow; property?: PropertyRow }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<TaskView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const leadId = lead?.id, propertyId = property?.id;
  const reload = useCallback(async () => {
    try { const r = await loadTasks(office.id, { leadId, propertyId }); setError(null); setRows(sortTasks(r.tasks)); }
    catch (e) { setError(e instanceof Error ? e.message : t('Something went wrong.')); }
  }, [office.id, leadId, propertyId]);
  useEffect(() => { reload(); }, [reload]);

  const toggle = async (x: TaskView) => {
    setBusyId(x.task.id); setError(null);
    const err = await toggleTask(x.task);
    setBusyId(null);
    if (err) setError(t(err)); else reload();
  };

  const editing = rows?.find(x => x.task.id === editId)?.task;
  const open = rows?.filter(x => x.task.status === 'open').length ?? 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('Tasks')} {rows && <span className="tabular opacity-60">{open}</span>}</h3>
        {canWrite && <Btn tone="ghost" className="!px-3 !py-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add task')}</Btn>}
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="text-sm text-muted">…</p>}
      {rows !== null && rows.length === 0 && !error && <p className="text-sm text-muted">{t('No tasks yet.')}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(x => <TaskItem key={x.task.id} item={x} canWrite={canWrite} busy={busyId === x.task.id} showLinks={false} onToggle={() => toggle(x)} onOpen={() => canWrite && setEditId(x.task.id)} />)}
        </ul>
      )}
      {adding && <TaskForm orgId={office.id} userId={userId} leadId={leadId} propertyId={propertyId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {editing && <TaskForm key={editing.id} orgId={office.id} userId={userId} task={editing} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); reload(); }} />}
    </div>
  );
}
