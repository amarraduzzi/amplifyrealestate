import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, TrendingUp } from 'lucide-react';
import { formatMad, dirhamToCents } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PersonRow } from '../lib/types';
import { planError } from '../lib/plan';
import { waLink } from './ContactLinks';
import { Btn, inputCls } from './ui';

type Rule = { next: string; max_pct: number; allowed: boolean };
type Revision = { id: string; effective_on: string; old_cents: number; new_cents: number; note: string | null };
const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

function revisionError(m: string) {
  if (m.includes('rent_revision_too_soon')) return t('The rent can only go up three years after the start of the lease or the last increase.');
  if (m.includes('rent_revision_too_high')) return t('This is more than the law allows.');
  if (m.includes('rent_revision_invalid')) return t('Enter a new rent that differs from the current one.');
  return planError(m);
}

/** Rent increase by Moroccan law: every three years at most, 8% for housing, 10% for other use. A decrease is always possible. */
export function RentRevision({ office, leaseId, rentCents, person, propertyTitle, onChanged }: {
  office: Office; leaseId: string; rentCents: number; person: PersonRow | undefined; propertyTitle: string; onChanged: () => void;
}) {
  const [rule, setRule] = useState<Rule | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, h] = await Promise.all([
      supabase.rpc('rent_revision_rule', { p_lease: leaseId }),
      supabase.from('rent_revisions').select('id, effective_on, old_cents, new_cents, note').eq('lease_id', leaseId).order('effective_on', { ascending: false }),
    ]);
    if (r.error) { setRule(null); return; }
    setRule(r.data as Rule); setHistory((h.data ?? []) as Revision[]);
  }, [leaseId]);
  useEffect(() => { load(); }, [load]);
  if (!rule || office.role === 'viewer') return null;

  const maxCents = Math.floor(rentCents * (1 + rule.max_pct / 100) / 1000) * 1000; // rounded down to 10 DH
  const apply = async () => {
    const v = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { setError(t('Enter a new rent that differs from the current one.')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('revise_rent', { p_lease: leaseId, p_new_cents: dirhamToCents(v), p_note: note });
    setBusy(false);
    if (error) { setError(revisionError(error.message)); return; }
    setOpen(false); setAmount(''); setNote(''); load(); onChanged();
  };
  const notify = () => {
    const v = Number(amount.replace(/\s/g, '').replace(',', '.'));
    const first = (person?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
    const text = `Bonjour ${first}, conformément à la loi 67-12 (révision possible tous les trois ans, ${rule.max_pct} % maximum), le loyer de « ${propertyTitle} » passera de ${formatMad(rentCents)} à ${formatMad(dirhamToCents(v || 0))} par mois. N'hésitez pas à me contacter pour en parler.\n— ${office.name}`;
    const n = person?.whatsapp || person?.phone;
    window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <section>
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" /> {t('Rent increase')}</h3>
      <p className={`mt-1 text-sm ${rule.allowed ? 'font-semibold text-ok' : 'text-muted'}`}>
        {rule.allowed
          ? t('An increase is possible now: at most {pct}%, up to {amount}.', { pct: rule.max_pct, amount: formatMad(maxCents) })
          : t('Next increase possible from {date} (at most {pct}%).', { date: day(rule.next), pct: rule.max_pct })}
      </p>
      {!open && <Btn tone="ghost" className="mt-2" onClick={() => { setOpen(true); setAmount(String((rule.allowed ? maxCents : rentCents) / 100)); }}>{t('Change the rent')}</Btn>}
      {open && (
        <div className="mt-2 space-y-2 rounded-2xl bg-surface-2 p-3">
          <label className="block text-sm font-semibold">{t('New rent per month (DH)')}
            <input className={`${inputCls} mt-1`} dir="ltr" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </label>
          <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('Note (optional), for example the agreement with the tenant')} />
          <div className="flex flex-wrap justify-end gap-2">
            <Btn tone="ghost" onClick={notify}><MessageCircle className="h-4 w-4" /> {t('Inform the tenant')}</Btn>
            <Btn onClick={() => setOpen(false)}>{t('Cancel')}</Btn>
            <Btn tone="brand" disabled={busy} onClick={apply}>{t('Apply')}</Btn>
          </div>
          <p className="text-xs text-muted">{t('Open rent months that are not paid yet get the new amount.')}</p>
        </div>
      )}
      {history.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {history.map(h => <li key={h.id}>{day(h.effective_on)}: {formatMad(h.old_cents)} → {formatMad(h.new_cents)}{h.note ? ` · ${h.note}` : ''}</li>)}
        </ul>
      )}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
