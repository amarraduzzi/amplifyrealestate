import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { createInspection, loadInspections, type Inspection } from '../lib/inspections';
import { planError } from '../lib/plan';
import { InspectionEditor } from '../pages/InspectionEditor';
import { Btn } from './ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/** In a lease: the check-in and check-out reports. */
export function InspectionsSection({ office, leaseId, property, tenant }: { office: Office; leaseId: string; property: { title: string; reference: string }; tenant: string }) {
  const [rows, setRows] = useState<Inspection[] | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';
  const load = useCallback(async () => setRows(await loadInspections(leaseId)), [leaseId]);
  useEffect(() => { load(); }, [load]);
  if (!rows || office.role === 'viewer') return null;

  const entry = rows.find(r => r.kind === 'entry');
  const exit = rows.find(r => r.kind === 'exit');
  const start = async (kind: 'entry' | 'exit') => {
    setBusy(true); setError(null);
    try { const i = await createInspection(office.id, leaseId, kind, kind === 'exit' ? entry : undefined); await load(); setOpenId(i.id); }
    catch (e) { setError(planError(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const opened = rows.find(r => r.id === openId);
  const line = (i: Inspection | undefined, kind: 'entry' | 'exit') => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="text-sm font-semibold">{kind === 'entry' ? t('Check-in report') : t('Check-out report')}
        {i && <span className="ms-2 text-xs font-normal text-muted">{day(i.inspected_on)}</span>}
      </span>
      {i ? (
        <span className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${i.status === 'signed' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{i.status === 'signed' ? t('Signed') : t('Draft')}</span>
          <Btn tone="ghost" onClick={() => setOpenId(i.id)}>{t('Open')}</Btn>
        </span>
      ) : canWrite && (kind === 'entry' || entry) ? <Btn tone="ghost" disabled={busy} onClick={() => start(kind)}>{t('Start the report')}</Btn> : null}
    </li>
  );

  return (
    <section>
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4" /> {t('État des lieux')}</h3>
      <ul className="mt-2 space-y-1.5">{line(entry, 'entry')}{line(exit, 'exit')}</ul>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {opened && <InspectionEditor office={office} inspection={opened} entry={opened.kind === 'exit' ? entry : undefined} property={property} tenant={tenant} onClose={() => { setOpenId(null); load(); }} onChanged={load} />}
    </section>
  );
}
