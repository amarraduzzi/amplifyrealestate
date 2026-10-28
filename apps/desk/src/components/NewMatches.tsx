import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, MessageCircle, Sparkles, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadNewMatches, markMatches, type NewMatch } from '../lib/newMatches';
import { matchesMessage } from '../lib/leadMessage';
import { SHARE_LANGS, whatsappShareUrl, type ShareLang } from '../lib/publicSite';
import { priceSuffix } from '../lib/labels';
import { planError } from '../lib/plan';
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display flex min-w-0 items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-brand" /> {t('New matches')} <span className="tabular text-base opacity-60">{rows.length}</span>
        </h2>
        <button type="button" onClick={() => onGo('leads')} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-muted hover:text-ink">
          {t('See all')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <p className="mb-2 text-xs text-muted">{t('New properties of the last 14 days that fit what these leads are looking for.')}</p>
      {canWrite && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Language of the message')}>
          <span className="me-1 text-xs font-semibold text-muted">{t('Language of the message')}</span>
          {SHARE_LANGS.map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {list.map(m => (
          <li key={m.lead.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold">{m.person?.full_name ?? '…'}
                <span className="ms-2 text-xs font-bold text-brand">{m.props.length === 1 ? t('1 new property') : t('{n} new properties', { n: m.props.length })}</span>
              </p>
              {canWrite && (
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" disabled={busy !== null} onClick={() => send(m)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-ok/10 px-3 py-1.5 text-sm font-semibold text-ok transition hover:bg-ok/15 disabled:opacity-40">
                    <MessageCircle className="h-4 w-4" /> {t('Send')}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => skip(m)} aria-label={t('Skip')} title={t('Skip')}
                    className="grid h-8 w-8 place-items-center rounded-xl text-muted transition hover:bg-surface hover:text-ink disabled:opacity-40"><X className="h-4 w-4" /></button>
                </span>
              )}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {m.props.slice(0, 3).map(p => (
                <li key={p.id} className="truncate text-sm text-muted">
                  {p.title} <span className="tabular font-semibold text-ink">· {formatMad(p.price_cents)}{priceSuffix(p.purpose) ? ` ${priceSuffix(p.purpose)}` : ''}</span>
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
