import { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronRight, MessageCircle, Sparkles, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadNewMatches, markMatches, type NewMatch } from '../lib/newMatches';
import { matchesMessage } from '../lib/leadMessage';
import { SHARE_LANGS, whatsappShareUrl, type ShareLang } from '../lib/publicSite';
import { priceSuffix } from '../lib/labels';
import { planError } from '../lib/plan';
import { useCovers } from '../lib/covers';
import { waLink } from './ContactLinks';
import type { View } from './Shell';

const SHOWN = 5;      // leads on Today
const PER_MSG = 6;    // properties in one WhatsApp message

/** On Today: leads for whom a property became available that fits, with one tap to send them on WhatsApp. */
export function NewMatches({ office, onGo, onCount }: { office: Office; onGo: (v: View) => void; onCount: (n: number) => void }) {
  const canWrite = office.role !== 'viewer';
  const [rows, setRows] = useState<NewMatch[] | null>(null);
  const [lang, setLang] = useState<ShareLang>('fr');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    try { const r = await loadNewMatches(office.id); setRows(r); onCount(r.length); }
    catch { setRows([]); onCount(0); } // Today keeps working without this block
  }, [office.id, onCount]);
  useEffect(() => { load(); }, [load]);
  const covers = useCovers((rows ?? []).flatMap(m => m.props.slice(0, 3).map(p => p.id)));

  if (!rows || rows.length === 0) return null;

  const drop = (leadId: string, ids: string[]) => {
    setRows(rs => {
      const next = (rs ?? []).map(r => r.lead.id === leadId ? { ...r, props: r.props.filter(p => !ids.includes(p.id)) } : r).filter(r => r.props.length > 0);
      onCount(next.length);
      return next;
    });
  };

  const send = async (m: NewMatch) => {
    if (busy) return;
    const props = m.props.slice(0, PER_MSG);
    const first = (m.person?.full_name ?? '').trim().split(/\s+/)[0] || '';
    const text = matchesMessage({ lang, name: first, office, props });
    const number = m.person?.whatsapp || m.person?.phone || null;
    // Open WhatsApp straight from the tap (browsers block windows opened later), then remember it.
    window.open(number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : whatsappShareUrl(text), '_blank', 'noopener');
    setBusy(m.lead.id); setError(null);
    const err = await markMatches(m.lead.id, props.map(p => p.id), 'sent');
    setBusy(null);
    if (err) setError(planError(err)); else drop(m.lead.id, props.map(p => p.id));
  };

  const skip = async (m: NewMatch) => {
    if (busy) return;
    setBusy(m.lead.id); setError(null);
    const ids = m.props.map(p => p.id);
    const err = await markMatches(m.lead.id, ids, 'dismissed');
    setBusy(null);
    if (err) setError(planError(err)); else drop(m.lead.id, ids);
  };

  const list = all ? rows : rows.slice(0, SHOWN);

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="font-display flex min-w-0 items-center gap-2 text-lg font-semibold leading-tight">
          <Sparkles className="h-4 w-4 shrink-0 text-brand" /> <span className="min-w-0">{t('New matches')}</span>
          <span className="tabular rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">{rows.length}</span>
        </h2>
        <button type="button" onClick={() => onGo('leads')} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-muted">{t('New properties of the last 14 days that fit what these leads are looking for.')}</p>
        {canWrite && (
          <div className="flex shrink-0 gap-1" role="group" aria-label={t('Language of the message')} title={t('Language of the message')}>
            {SHARE_LANGS.map(l => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="space-y-2.5">
        {list.map(m => (
          <li key={m.lead.id} className="lift rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line/[0.06]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-base font-semibold">{m.person?.full_name ?? '…'}</p>
                <p className="text-xs font-bold text-brand">{m.props.length === 1 ? t('1 new property') : t('{n} new properties', { n: m.props.length })}</p>
              </div>
              {canWrite && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={busy !== null} onClick={() => send(m)} aria-label={t('Send')} title={t('Send')}
                    className="grid h-10 w-10 place-items-center rounded-full bg-ok text-white transition active:scale-90 disabled:opacity-40">
                    <MessageCircle className="h-5 w-5" />
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => skip(m)} aria-label={t('Skip')} title={t('Skip')}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"><X className="h-4 w-4" /></button>
                </span>
              )}
            </div>
            <ul className="mt-3 space-y-2.5 border-t border-line/[0.07] pt-3">
              {m.props.slice(0, 3).map(p => (
                <li key={p.id} className="flex items-center gap-3">
                  {covers[p.id]
                    ? <img src={covers[p.id]} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-xl bg-surface-2 object-cover" />
                    : <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted/60"><Building2 className="h-6 w-6" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.title}</span>
                    <span className="tabular mt-0.5 block text-sm font-bold text-brand">{formatMad(p.price_cents)}{priceSuffix(p.purpose) ? ` ${priceSuffix(p.purpose)}` : ''}</span>
                  </span>
                </li>
              ))}
              {m.props.length > 3 && <li className="text-xs text-muted">{t('And {n} more.', { n: m.props.length - 3 })}</li>}
            </ul>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && !all && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm font-semibold text-brand hover:underline">{t('Show all {n}', { n: rows.length })}</button>
      )}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
