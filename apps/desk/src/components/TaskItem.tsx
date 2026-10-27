import { Check, Link2 } from 'lucide-react';
import { t } from '../lib/i18n';
import type { TaskView } from '../lib/tasks';
import { daysUntil, dueText } from '../lib/dates';

/** One task as a row: a tick circle, the title, the deadline and who/what it is for. */
export function TaskItem({ item, canWrite, busy, showLinks = true, onToggle, onOpen }: {
  item: TaskView; canWrite: boolean; busy?: boolean; showLinks?: boolean; onToggle: () => void; onOpen: () => void;
}) {
  const { task, assignee, leadName, propertyTitle } = item;
  const open = task.status === 'open';
  const late = open && task.due_date !== null && daysUntil(task.due_date) < 0;
  const links = [leadName, propertyTitle].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
      <button type="button" onClick={onToggle} disabled={!canWrite || busy || task.status === 'cancelled'}
        aria-label={task.status === 'done' ? t('Open this task again') : t('Mark as done')} aria-pressed={task.status === 'done'}
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-40 ${task.status === 'done' ? 'border-ok bg-ok text-white' : 'border-line/30 bg-surface text-transparent hover:border-ok hover:text-ok/50'}`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <p className={`truncate text-sm font-semibold ${task.status === 'open' ? '' : 'text-muted line-through'}`}>{task.title}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
          {task.due_date && open && <span className={`font-semibold ${late ? 'text-danger' : daysUntil(task.due_date) === 0 ? 'text-warn' : ''}`}>{dueText(task.due_date)}</span>}
          {task.status === 'cancelled' && <span className="font-semibold">{t('Cancelled')}</span>}
          {assignee && <span dir="ltr">{assignee}</span>}
          {showLinks && links && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{links}</span>}
        </p>
      </button>
    </li>
  );
}
