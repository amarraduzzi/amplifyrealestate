import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office, PersonRow } from '../lib/types';
import { priceSuffix, typeLabel } from '../lib/labels';
import type { MatchProp } from '../lib/matching';
import { SHARE_LANGS, whatsappShareUrl, type ShareLang } from '../lib/publicSite';
import { matchesMessage } from '../lib/leadMessage';
import { waLink } from './ContactLinks';

const MAX = 6;

/** The properties that fit a lead, each with a tick box, and one button that sends the ticked ones to the lead on WhatsApp. */
export function SendMatches({ office, person, matches }: { office: Office; person: PersonRow | undefined; matches: MatchProp[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(matches.slice(0, MAX).map(p => p.id)));
  const [lang, setLang] = useState<ShareLang>('fr');
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(() => matches.filter(p => picked.has(p.id)), [matches, picked]);
  const number = person?.whatsapp || person?.phone || null;
  const firstName = (person?.full_name ?? '').trim().split(/\s+/)[0] || '';

  const toggle = (id: string) => {
    setError(null);
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size >= MAX) { setError(t('Choose at most {n} properties per message.', { n: MAX })); return prev; }
      else next.add(id);
      return next;
    });
  };

  const send = () => {
    if (chosen.length === 0) { setError(t('Select at least one property.')); return; }
    const text = matchesMessage({ lang, name: firstName, office, props: chosen });
    const url = number ? `${waLink(number)}?text=${encodeURIComponent(text)}` : whatsappShareUrl(text);
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {matches.map(p => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.title}</span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
                  <span className="tabular font-semibold text-ink">{formatMad(p.price_cents)}</span>
                  <span>{priceSuffix(p.purpose)}</span>
                  <span>· {[p.neighborhood, p.city].filter(Boolean).join(', ') || '—'} · {typeLabel(p.property_type)}</span>
                  <span className="tabular ms-auto text-xs">{p.reference}</span>
                </span>
                {!p.is_published && <span className="mt-1 block text-xs text-muted">{t('No public page')}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Language of the message')}>
          <span className="me-1 text-xs font-semibold text-muted">{t('Language of the message')}</span>
          {SHARE_LANGS.map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={send} disabled={chosen.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm font-semibold text-ok transition hover:bg-ok/15 disabled:opacity-40 sm:px-4">
          <MessageCircle className="h-4 w-4" /> {t('Send {n} on WhatsApp', { n: chosen.length })}
        </button>
        <p className="text-xs text-muted">
          {number ? t('Properties without a public page are sent as text, without a link.') : t('This person has no number yet: you choose the contact in WhatsApp.')}
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
