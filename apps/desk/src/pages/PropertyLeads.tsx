import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PersonRow, PropertyRow } from '../lib/types';
import { OPEN_LEAD_STATUSES, leadStatusCls, leadStatusLabel } from '../lib/labels';
import { matches } from '../lib/matching';
import { BellRing, MessageCircle } from 'lucide-react';
import { ContactLinks, waLink } from '../components/ContactLinks';
import { matchesMessage } from '../lib/leadMessage';
import { ContactAge } from '../components/ContactAge';
import { budgetText, criteriaText } from '../components/leadText';
import { friendly } from '../lib/errors';

/** On a property: which leads are looking for something like this? Only shown while the property is available. */
export function PropertyLeads({ office, property }: { office: Office; property: PropertyRow }) {
  const [rows, setRows] = useState<{ lead: LeadRow; person: PersonRow | undefined }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = property.status === 'available';

  useEffect(() => {
    if (!available) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      const l = await supabase.from('leads').select('*').eq('org_id', office.id).eq('purpose', property.purpose).in('status', OPEN_LEAD_STATUSES);
      if (l.error) { if (!cancelled) setError(friendly(l.error)); return; }
      const fits = ((l.data ?? []) as LeadRow[]).filter(x => matches(x, property));
      const ids = Array.from(new Set(fits.map(x => x.person_id)));
      const map: Record<string, PersonRow> = {};
      if (ids.length > 0) {
        const p = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', ids);
        for (const x of (p.data ?? []) as PersonRow[]) map[x.id] = x;
      }
      if (!cancelled) setRows(fits.map(x => ({ lead: x, person: map[x.person_id] })));
    })();
    return () => { cancelled = true; };
    // Re-check when something that matters for matching changes.
  }, [office.id, property, available]);

  if (!available) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t('Leads looking for this')} {rows && <span className="tabular opacity-60">{rows.length}</span>}</h3>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && !error && <p className="text-sm text-muted">…</p>}
      {rows !== null && rows.length === 0 && !error && <p className="text-sm text-muted">{t('No lead is looking for something like this yet.')}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(({ lead, person }) => (
            <li key={lead.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{person?.full_name ?? '…'}</span>
                  {lead.wants_alerts && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"><BellRing className="h-3 w-3" /> {t('WhatsApp alert')}</span>}
                </p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${leadStatusCls[lead.status]}`}>{leadStatusLabel(lead.status)}</span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{budgetText(lead)} · {criteriaText(lead)}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                {person && <ContactLinks c={person} />}
                {lead.wants_alerts && person && (person.whatsapp || person.phone) && (
                  <a href={`${waLink((person.whatsapp || person.phone) as string)}?text=${encodeURIComponent(matchesMessage({
                      lang: lead.alert_lang ?? 'fr', name: person.full_name.split(' ')[0], office, props: [property] }))}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white hover:brightness-95">
                    <MessageCircle className="h-3.5 w-3.5" /> {t('Send this property')}
                  </a>
                )}
                <ContactAge iso={lead.last_contact_at} stale />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
