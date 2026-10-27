import { CheckCircle2 } from 'lucide-react';
import { t } from '../lib/i18n';
import { daysSince } from '../lib/labels';

/** "Confirmed X days ago": turns orange after 30 days. */
export function Confirmed({ iso }: { iso: string | null }) {
  const d = daysSince(iso);
  if (d === null) return null;
  const stale = d > 30;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${stale ? 'text-warn' : 'text-muted'}`}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {d === 0 ? t('Confirmed today') : d === 1 ? t('Confirmed yesterday') : t('Confirmed {n} days ago', { n: d })}
    </span>
  );
}
