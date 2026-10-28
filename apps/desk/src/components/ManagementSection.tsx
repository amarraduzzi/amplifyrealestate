import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Briefcase } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { lastMonth, loadContract, loadStatements, makeStatement, monthName, type Contract, type OwnerLang, type Statement } from '../lib/management';
import { planError } from '../lib/plan';
import { StatementDoc } from '../pages/StatementDoc';
import { Btn, Field, inputCls } from './ui';

type Owner = { id: string; full_name: string; phone: string | null; whatsapp: string | null };
const appLang = (): OwnerLang => (getLang() === 'ar' ? 'ar' : getLang() === 'en' ? 'en' : 'fr');

function statementError(m: string) {
  if (m.includes('statement_paid_out')) return t('This statement has been paid out and can no longer change.');
  if (m.includes('statement_future_month')) return t('You can only make a statement for this month or earlier.');
  if (m.includes('contract_owner_not_owner')) return t('Add this person as owner of the property first.');
  if (m.includes('management_one_active_idx')) return t('This property already has a running management contract.');
  return planError(m);
}

/** Gestion locative for a rental property: the contract with the owner and the monthly statements. */
export function ManagementSection({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerLang, setOwnerLang] = useState<OwnerLang>(appLang());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ owner: '', fee: '8', day: '10', rib: '', start: new Date().toISOString().slice(0, 10) });
  const [month, setMonth] = useState(lastMonth().slice(0, 7));
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const c = await loadContract(property.id);
    setContract(c);
    const pp = await supabase.from('property_parties').select('person_id').eq('property_id', property.id).eq('role', 'owner');
    const ids = ((pp.data ?? []) as { person_id: string }[]).map(x => x.person_id);
    const pe = ids.length ? await supabase.from('people').select('id, full_name, phone, whatsapp').in('id', ids) : { data: [] };
    const list = (pe.data ?? []) as Owner[];
    setOwners(list);
    setForm(f => ({ ...f, owner: f.owner || list[0]?.id || '' }));
    if (c) {
      setStatements(await loadStatements({ contractId: c.id }));
      const l = await supabase.from('owner_links').select('lang').eq('person_id', c.owner_person_id).is('revoked_at', null).maybeSingle();
      if (l.data?.lang) setOwnerLang(l.data.lang as OwnerLang);
    }
  }, [property.id]);
  useEffect(() => { load(); }, [load]);

  if (property.purpose === 'sale' || contract === undefined || office.role === 'viewer') return null;
  const owner = owners.find(o => o.id === contract?.owner_person_id);
  const opened = statements.find(s => s.id === openId);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const fee = Number(form.fee.replace(',', '.')), day = Number(form.day);
    if (!form.owner) { setError(t('Add this person as owner of the property first.')); return; }
    if (!Number.isFinite(fee) || fee < 0 || fee > 50) { setError(t('Enter a fee between 0 and 50%.')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from('management_contracts').insert({
      org_id: office.id, property_id: property.id, owner_person_id: form.owner, fee_pct: fee, payout_day: Math.min(28, Math.max(1, day || 10)),
      owner_rib: form.rib.trim() || null, start_date: form.start,
    });
    setBusy(false);
    if (error) { setError(statementError(error.message)); return; }
    setAdding(false); load();
  };
  const make = async () => {
    if (!contract || busy) return;
    setBusy(true); setError(null);
    try { const id = await makeStatement(contract.id, `${month}-01`); await load(); setOpenId(id); }
    catch (e) { setError(statementError(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const end = async () => {
    if (!contract || !window.confirm(t('End the management contract? Existing statements stay.'))) return;
    const { error } = await supabase.from('management_contracts').update({ status: 'ended' }).eq('id', contract.id);
    if (error) setError(statementError(error.message)); else load();
  };

  return (
    <section>
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Briefcase className="h-4 w-4" /> {t('Property management')}</h3>
      {!contract ? (
        <>
          <p className="mt-1 text-sm text-muted">{t('You collect the rent and pay the owner every month, minus your fee and repairs. Make a contract to get a monthly statement.')}</p>
          {canWrite && !adding && <Btn tone="ghost" className="mt-2" onClick={() => setAdding(true)}>{t('Start management contract')}</Btn>}
          {adding && (
            <form onSubmit={create} className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5">
              {owners.length === 0
                ? <p className="text-sm font-semibold text-warn">{t('Add this person as owner of the property first.')}</p>
                : (
                  <Field label={t('Owner')}>
                    <select className={inputCls} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                    </select>
                  </Field>
                )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('Fee (% of rent collected)')}><input className={inputCls} dir="ltr" inputMode="decimal" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} /></Field>
                <Field label={t('Payout day')}><input className={inputCls} dir="ltr" inputMode="numeric" value={form.day} onChange={e => setForm({ ...form, day: e.target.value })} /></Field>
                <Field label={t('Start')}><input type="date" className={inputCls} value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></Field>
              </div>
              <Field label={t('RIB of the owner (optional)')}><input className={inputCls} dir="ltr" value={form.rib} onChange={e => setForm({ ...form, rib: e.target.value })} maxLength={60} /></Field>
              <div className="flex justify-end gap-2">
                <Btn type="button" onClick={() => setAdding(false)}>{t('Cancel')}</Btn>
                <Btn tone="brand" type="submit" disabled={busy || owners.length === 0}>{t('Save')}</Btn>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm">
            <span className="font-semibold">{owner?.full_name ?? '…'}</span> · {t('fee {pct}%', { pct: Number(contract.fee_pct) })} · {t('payout on day {n}', { n: contract.payout_day })}
          </p>
          {canWrite && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-line/[0.12] bg-surface px-3 py-2 text-sm" aria-label={t('Month')} />
              <Btn tone="brand" disabled={busy || !month} onClick={make}>{t('Make statement')}</Btn>
              <Btn tone="ghost" onClick={end} className="ms-auto">{t('End contract')}</Btn>
            </div>
          )}
          {statements.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {statements.map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-start text-sm transition hover:ring-2 hover:ring-brand/25">
                    <span className="font-semibold capitalize">{monthName(s.period, appLang())}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatMad(s.payout_cents)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'paid_out' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{s.status === 'paid_out' ? t('Paid out') : t('To pay out')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {opened && contract && (
        <StatementDoc office={office} statement={opened} contract={contract} owner={{ name: owner?.full_name ?? '', number: owner?.whatsapp || owner?.phone || null }}
          property={{ title: property.title, reference: property.reference }} defaultLang={ownerLang} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </section>
  );
}
