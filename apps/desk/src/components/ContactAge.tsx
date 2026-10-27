import { PhoneCall } from 'lucide-react';
import { t } from '../lib/i18n';
import { daysSince } from '../lib/labels';

/** "Contacted X days ago": turns orange after 14 days for leads that are still looking. */
export function ContactAge({ iso, stale }: { iso: string | null; stale: boolean }) {
  const d = daysSince(iso);
  if (d === null) return null;
  const late = stale && d > 14;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${late ? 'text-warn' : 'text-muted'}`}>
      <PhoneCall className="h-3.5 w-3.5" />
      {d === 0 ? t('Contacted today') : d === 1 ? t('Contacted yesterday') : t('Contacted {n} days ago', { n: d })}
    </span>
  );
}
