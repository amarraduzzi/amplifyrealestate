import { t } from './i18n';
import { whenText } from './dates';
import type { TaskView } from './tasks';
import type { ViewingView } from './viewings';

const MAX = 8;

const section = (title: string, lines: string[]) => {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, MAX).map(l => `• ${l}`);
  if (lines.length > MAX) shown.push(t('And {n} more.', { n: lines.length - MAX }));
  return `\n*${title} (${lines.length})*\n${shown.join('\n')}`;
};

/** A short text for the team on WhatsApp: tasks due, viewings this week, and how many leads wait for a call. */
export function briefingText(opts: { office: string; date: string; due: TaskView[]; viewings: ViewingView[]; leadsToCall: number }): string {
  const parts = [
    `*${opts.office}* — ${opts.date}`,
    section(t('Tasks due'), opts.due.map(x => x.task.title)),
    section(t('Viewings this week'), opts.viewings.map(x => `${whenText(x.v.scheduled_at)} — ${x.person?.full_name ?? '…'} · ${x.property?.title ?? '…'}`)),
    opts.leadsToCall > 0 ? `\n${t('Leads to call back')}: ${opts.leadsToCall}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}
