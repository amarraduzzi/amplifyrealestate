import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Upload, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PersonRow } from '../lib/types';
import { LEAD_STATUSES, OPEN_LEAD_STATUSES, leadStatusCls, leadStatusLabel, purposeLabel } from '../lib/labels';
import { MATCH_COLUMNS, matches, type MatchProp } from '../lib/matching';
import { Btn, Card, inputCls } from '../components/ui';
import { ContactAge } from '../components/ContactAge';
import { budgetText, criteriaText } from '../components/leadText';
import { ImportContacts } from './ImportContacts';
import { LeadForm } from './LeadForm';
import { LeadDetail } from './LeadDetail';

type Filter = 'all' | LeadRow['status'];

export function Leads({ office, userId }: { office: Office; userId: string }) {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, PersonRow>>({});
  const [available, setAvailable] = useState<MatchProp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    const [l, p, a] = await Promise.all([
      supabase.from('leads').select('*').eq('org_id', office.id).order('created_at', { ascending: false }),
      supabase.from('people').select('id, full_name, phone, whatsapp, email').eq('org_id', office.id),
      supabase.from('properties').select(MATCH_COLUMNS).eq('org_id', office.id).eq('status', 'available'),
    ]);
    const err = l.error ?? p.error ?? a.error;
    if (err) { setError(err.message); return; }
    const map: Record<string, PersonRow> = {};
    for (const x of (p.data ?? []) as PersonRow[]) map[x.id] = x;
    setError(null); setPeople(map); setAvailable((a.data ?? []) as MatchProp[]); setLeads((l.data ?? []) as LeadRow[]);
  }, [office.id]);
  useEffect(() => { setLeads(null); load(); }, [load]);

  /** Available properties that fit each lead that is still looking. */
  const matchMap = useMemo(() => {
    const m: Record<string, MatchProp[]> = {};
    for (const l of leads ?? []) m[l.id] = OPEN_LEAD_STATUSES.includes(l.status) ? available.filter(p => matches(l, p)) : [];
    return m;
  }, [leads, available]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads?.length ?? 0 };
    for (const l of leads ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (leads ?? []).filter(l => {
      if (filter !== 'all' && l.status !== filter) return false;
      if (!needle) return true;
      const p = people[l.person_id];
      return [p?.full_name, p?.phone, p?.whatsapp, p?.email, l.city, l.neighborhoods.join(' '), l.notes].some(x => x?.toLowerCase().includes(needle));
    });
  }, [leads, people, filter, q]);

  const tabs: Filter[] = ['all', ...LEAD_STATUSES.filter(s => (counts[s] ?? 0) > 0 || s === 'new')];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Leads')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Btn tone="ghost" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> {t('Import contacts')}</Btn>
            <Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add lead')}</Btn>
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {leads === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {leads !== null && leads.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Users className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No leads yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Add someone who is looking for a property, with what they want. Available properties that fit show up automatically.')}</p>
          {canWrite && <Btn tone="brand" className="mt-5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add your first lead')}</Btn>}
        </Card>
      )}

      {leads !== null && leads.length > 0 && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : leadStatusLabel(f)} <span className="tabular opacity-60">{counts[f] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:ms-auto sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputCls} ps-9`} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
            </div>
          </div>

          {shown.length === 0
            ? <p className="mt-10 text-center text-muted">{t('Nothing matches.')}</p>
            : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {shown.map(l => {
                  const n = matchMap[l.id]?.length ?? 0;
                  const open = OPEN_LEAD_STATUSES.includes(l.status);
                  return (
                    <li key={l.id} role="button" tabIndex={0} aria-label={people[l.person_id]?.full_name ?? ''}
                      onClick={() => setOpenId(l.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(l.id); } }}
                      className="card rise cursor-pointer rounded-2xl p-4 outline-none transition hover:ring-2 hover:ring-brand/30 focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display truncate text-lg font-semibold">{people[l.person_id]?.full_name ?? '…'}</h3>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${leadStatusCls[l.status]}`}>{leadStatusLabel(l.status)}</span>
                      </div>
                      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display tabular text-base font-bold">{budgetText(l)}</span>
                        <span className="ms-auto rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{purposeLabel(l.purpose)}</span>
                      </p>
                      <p className="mt-1.5 text-sm text-muted">{criteriaText(l)}</p>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/[0.07] pt-3">
                        <ContactAge iso={l.last_contact_at} stale={open} />
                        {open && (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${n > 0 ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-muted'}`}>
                            {n === 0 ? t('No match yet') : n === 1 ? t('1 match') : t('{n} matches', { n })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </>
      )}

      {openId && (() => {
        const lead = (leads ?? []).find(l => l.id === openId);
        return lead
          ? <LeadDetail key={lead.id} office={office} userId={userId} lead={lead} person={people[lead.person_id]} matches={matchMap[lead.id] ?? []} onChanged={load} onClose={() => setOpenId(null)} />
          : null;
      })()}

      {importing && <ImportContacts orgId={office.id} onClose={() => setImporting(false)} onDone={load} />}
      {adding && <LeadForm orgId={office.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
