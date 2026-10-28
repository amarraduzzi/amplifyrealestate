import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, MessageCircle, Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { SW, markPaidOut, monthName, statementMessage, type Contract, type OwnerLang, type Statement } from '../lib/management';
import { planError } from '../lib/plan';
import { waLink } from '../components/ContactLinks';
import { Btn } from '../components/ui';

/** The monthly statement for the owner, in the owner's language, printable, with "paid out" and a WhatsApp summary. */
export function StatementDoc({ office, statement, contract, owner, property, defaultLang, onClose, onChanged }: {
  office: Office; statement: Statement; contract: Contract; owner: { name: string; number: string | null }; property: { title: string; reference: string };
  defaultLang: OwnerLang; onClose: () => void; onChanged: () => void;
}) {
  const [lang, setLang] = useState<OwnerLang>(defaultLang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const w = SW[lang], s = statement;
  const canManage = office.role === 'owner' || office.role === 'manager';
  const day = (d: string) => new Intl.DateTimeFormat(w.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

  const paidOut = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const err = await markPaidOut(s.id);
    setBusy(false);
    if (err) setError(planError(err)); else onChanged();
  };
  const send = () => {
    const first = owner.name.trim().split(/\s+/)[0] ?? '';
    const text = statementMessage(s, lang, first, property.title, office.name);
    window.open(owner.number ? `${waLink(owner.number)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const Row = ({ label, value, strong, minus }: { label: string; value: number; strong?: boolean; minus?: boolean }) => (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'border-t-2 border-black/70 pt-2 text-base font-bold' : 'border-b border-black/10'}`}>
      <span>{label}</span><span className="tabular">{minus && value ? '- ' : ''}{formatMad(value)}</span>
    </div>
  );

  return createPortal((
    <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-2xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        <div className="no-print mb-5 space-y-3" dir="auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
              <Btn onClick={send}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')}</Btn>
            </div>
            <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['fr', 'ar', 'en', 'nl'] as const).map(l => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-black text-white' : 'bg-black/5'}`}>{l}</button>
            ))}
            {canManage && s.status === 'open' && <Btn tone="brand" disabled={busy} onClick={paidOut} className="ms-auto"><CheckCircle2 className="h-4 w-4" /> {t('Mark as paid out')}</Btn>}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <div className="text-[13px] leading-snug">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-lg font-bold">{office.name}</p></div>
            <div className="text-end">
              <p className="text-xl font-black uppercase tracking-wide">{w.title}</p>
              <p className="font-semibold capitalize">{monthName(s.period, lang)}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">{w.owner}</p><p className="font-semibold">{owner.name}</p></div>
            <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">{w.property}</p><p className="font-semibold">{property.title}</p><p dir="ltr" className="text-xs">{property.reference}</p></div>
          </div>

          <div className="mt-6">
            <Row label={w.rent} value={s.rent_cents} />
            <Row label={w.fee(Number(s.fee_pct))} value={s.fee_cents} minus />
            <Row label={w.repairs} value={s.repairs_cents} minus />
            <Row label={s.payout_cents < 0 ? w.owes : w.payout} value={Math.abs(s.payout_cents)} strong />
          </div>
          <p className={`mt-2 text-sm font-bold ${s.status === 'paid_out' ? 'text-green-700' : 'text-amber-700'}`}>{s.status === 'paid_out' && s.paid_out_on ? w.paid(day(s.paid_out_on)) : w.open}</p>
          {contract.owner_rib && <p className="mt-1 text-xs">{w.rib}: <span dir="ltr" className="tabular">{contract.owner_rib}</span></p>}

          {(s.details.rent?.length ?? 0) + (s.details.repairs?.length ?? 0) === 0 && <p className="mt-5 text-sm text-black/60">{w.none}</p>}
          {!!s.details.rent?.length && (<>
            <h3 className="mb-1 mt-6 border-b border-black/15 pb-1 text-xs font-bold uppercase tracking-wide">{w.received}</h3>
            {s.details.rent.map((r, i) => <p key={i} className="flex justify-between py-0.5"><span>{day(r.paid_on)} · {r.tenant}</span><span className="tabular">{formatMad(r.amount_cents)}</span></p>)}
          </>)}
          {!!s.details.repairs?.length && (<>
            <h3 className="mb-1 mt-5 border-b border-black/15 pb-1 text-xs font-bold uppercase tracking-wide">{w.done}</h3>
            {s.details.repairs.map((r, i) => <p key={i} className="flex justify-between py-0.5"><span>{day(r.done_on)} · {r.title}</span><span className="tabular">{formatMad(r.cost_cents)}</span></p>)}
          </>)}
        </div>
      </div>
    </div>
  ), document.body);
}
