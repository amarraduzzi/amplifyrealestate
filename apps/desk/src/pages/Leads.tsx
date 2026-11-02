import { EstimationRequests } from '../components/EstimationRequests';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, Check, Download, PhoneCall, Plus, Search, Upload, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { LeadRow, Office, PersonRow } from '../lib/types';
import { LEAD_STATUSES, OPEN_LEAD_STATUSES, daysSince, leadStatusCls, leadStatusLabel, purposeLabel, sourceLabel } from '../lib/labels';
import { MATCH_COLUMNS, matches, type MatchProp } from '../lib/matching';
import { Btn, Card, inputCls } from '../components/ui';
import { ContactAge } from '../components/ContactAge';
import { QuickBar } from '../components/QuickActions';
import { budgetText, criteriaText } from '../components/leadText';
import { ImportContacts } from './ImportContacts';
import { LeadForm } from './LeadForm';
import { LeadDetail } from './LeadDetail';
import { downloadCsv, leadsCsv } from '../lib/exportCsv';
import { friendly } from '../lib/errors';
import { Hero, PhoneSheet } from '../components/Hero';
import { Avatar } from '../components/Avatar';

type Filter = 'all' | LeadRow['status'];

/** The one thing to do next for a lead that is still looking, in one line. */
function nextStep(l: LeadRow, matchCount: number): { text: string; icon: typeof Check; cls: string } | null {
  if (!OPEN_LEAD_STATUSES.includes(l.status)) return null;
  const d = daysSince(l.last_contact_at);
  if (d === null) return { text: t('Make first contact'), icon: PhoneCall, cls: 'bg-qr/10 text-qr' };
  if (d > 14) return { text: t('Call back, {n} days since contact', { n: d }), icon: PhoneCall, cls: 'bg-warn/10 text-warn' };
  if (matchCount > 0) return { text: matchCount === 1 ? t('Send the matching property') : t('Send {n} matching properties', { n: matchCount }), icon: Building2, cls: 'bg-ok/10 text-ok' };
  if (l.status === 'viewing') return { text: t('Follow up on the viewing'), icon: CalendarClock, cls: 'bg-qr/10 text-qr' };
  return { text: t('No action needed'), icon: Check, cls: 'bg-surface-2 text-muted' };
}

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
    if (err) { setError(friendly(err)); return; }
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

  const loading = leads === null;
  const openCount = (leads ?? []).filter(l => OPEN_LEAD_STATUSES.includes(l.status)).length;
  const staleCount = (leads ?? []).filter(l => { const d = daysSince(l.last_contact_at); return OPEN_LEAD_STATUSES.includes(l.status) && d !== null && d > 14; }).length;
  const roundDark = 'grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition active:scale-90';
  const exportBtn = (cls: string) => (
    <button type="button" title={t('Export to Excel')} aria-label={t('Export to Excel')}
      onClick={() => downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, leadsCsv(shown, people))}
      className={cls}><Download className="h-4 w-4" /></button>
  );
  const importBtn = (cls: string) => (
    <button type="button" title={t('Import contacts')} aria-label={t('Import contacts')} onClick={() => setImporting(true)}
      className={cls}><Upload className="h-4 w-4" /></button>
  );

  return (
    <>
    <Hero
      title={t('Leads')}
      sub={loading ? undefined : t('{n} in total', { n: counts.all })}
      action={(shown.length > 0 || canWrite) ? (
        <div className="flex items-center gap-2">
          {shown.length > 0 && exportBtn(roundDark)}
          {canWrite && importBtn(roundDark)}
        </div>
      ) : undefined}
      stats={[
        { value: loading ? '–' : counts.new ?? 0, label: t('New') },
        { value: loading ? '–' : openCount, label: t('Still looking') },
        { value: loading ? '–' : staleCount, label: t('Leads to call back'), warn: !loading && staleCount > 0 },
      ]}
    />
    <PhoneSheet>
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 max-lg:pt-1">
      <div className="flex items-center justify-between gap-3 max-lg:hidden">
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl font-bold sm:text-3xl">{t('Leads')}</h1>
          <p className="text-sm text-muted">{t('{n} in total', { n: counts.all })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {shown.length > 0 && exportBtn('grid h-10 w-10 place-items-center rounded-full border border-line/[0.12] bg-surface text-muted transition hover:text-ink active:scale-95')}
          {canWrite && importBtn('grid h-10 w-10 place-items-center rounded-full border border-line/[0.12] bg-surface text-muted transition hover:text-ink active:scale-95')}
          {canWrite && <span className="hidden sm:block"><Btn tone="brand" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('Add lead')}</Btn></span>}
        </div>
      </div>

      <EstimationRequests office={office} />
      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {leads === null && !error && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map(i => (
            <li key={i} className="card rounded-3xl p-4 sm:p-5">
              <div className="skeleton h-5 w-1/2 rounded-lg" />
              <div className="skeleton mt-3 h-5 w-3/4 rounded-lg" />
              <div className="skeleton mt-3 h-4 w-2/3 rounded-lg" />
              <div className="skeleton mt-4 h-9 w-full rounded-full" />
            </li>
          ))}
        </ul>
      )}

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
            <div role="tablist" className="-mx-4 flex flex-nowrap gap-1.5 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {tabs.map(f => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95 ${filter === f ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {f === 'all' ? t('All') : leadStatusLabel(f)} <span className="tabular ms-0.5 text-[11px] opacity-60">{counts[f] ?? 0}</span>
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
                  const step = nextStep(l, n);
                  return (
                    <li key={l.id} role="button" tabIndex={0} aria-label={people[l.person_id]?.full_name ?? ''}
                      onClick={() => setOpenId(l.id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(l.id); } }}
                      className="card lift rise min-w-0 cursor-pointer rounded-3xl p-4 outline-none transition active:scale-[.985] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
                      <div className="flex items-start gap-3">
                        <Avatar name={people[l.person_id]?.full_name} id={l.person_id} className="lg:hidden" />
                        <h3 className="font-display min-w-0 flex-1 truncate text-lg font-semibold max-lg:pt-2">{people[l.person_id]?.full_name ?? '…'}</h3>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${leadStatusCls[l.status]}`}>{leadStatusLabel(l.status)}</span>
                      </div>
                      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display tabular text-base font-bold">{budgetText(l)}</span>
                        <span className="ms-auto rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{purposeLabel(l.purpose)}</span>
                      </p>
                      <p className="mt-1.5 text-sm text-muted">{criteriaText(l)}</p>
                      {l.source && <p className="mt-1 text-xs font-semibold text-muted">{t('Via {source}', { source: sourceLabel(l.source) })}</p>}
                      {step && (
                        <p className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold lg:hidden ${step.cls}`}>
                          <step.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{step.text}</span>
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/[0.07] pt-3 max-lg:hidden">
                        <ContactAge iso={l.last_contact_at} stale={open} />
                        {open && (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${n > 0 ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-muted'}`}>
                            {n === 0 ? t('No match yet') : n === 1 ? t('1 match') : t('{n} matches', { n })}
                          </span>
                        )}
                      </div>
                      <QuickBar c={people[l.person_id] ?? { phone: null, whatsapp: null }} />
                    </li>
                  );
                })}
              </ul>
            )}
        </>
      )}

      {canWrite && leads !== null && leads.length > 0 && !openId && !adding && !importing && (
        <button type="button" onClick={() => setAdding(true)} aria-label={t('Add lead')} title={t('Add lead')}
          className="gold-fill fixed end-4 z-20 grid h-14 w-14 place-items-center rounded-full text-brand-ink transition active:scale-90 sm:hidden"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}>
          <Plus className="h-6 w-6" />
        </button>
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
    </PhoneSheet>
    </>
  );
}
