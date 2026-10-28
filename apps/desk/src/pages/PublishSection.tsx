import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, MessageCircle } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { priceSuffix } from '../lib/labels';
import { PUBLIC_SITE, SHARE_LANGS, propertyUrl, whatsappShareUrl, type ShareLang } from '../lib/publicSite';
import { Btn, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

/** The database answers with short codes; show a sentence the person understands. */
function publishError(message: string): string {
  if (message.includes('publiceren_vereist_beschikbaar_pand')) return t('Only available or reserved properties can be published.');
  if (message.includes('publiceren_vereist_actief_mandaat')) return t('Add an active mandate first (see Mandate above). Without it the property cannot go online.');
  return friendly(message);
}

type State = 'live' | 'offline' | 'hidden_status' | 'hidden_mandate';

/**
 * Public page of one property: switch it on or off, copy the link, share it on WhatsApp.
 * What the visitor sees (and when) is decided by the database, see public_property_page.
 */
export function PublishSection({ office, property, canWrite, onChanged }: {
  office: Office; property: PropertyRow; canWrite: boolean; onChanged: () => void;
}) {
  const [state, setState] = useState<State | null | undefined>(undefined);
  const [noContact, setNoContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<ShareLang>('fr');
  const [copied, setCopied] = useState(false);

  const loadState = useCallback(async () => {
    const { data, error } = await supabase.rpc('property_public_state', { p_property: property.id });
    if (error) setError(friendly(error)); else setState((data ?? null) as State | null);
  }, [property.id]);
  useEffect(() => { loadState(); }, [loadState, property.is_published, property.status, property.updated_at]);

  useEffect(() => {
    supabase.from('organizations').select('public_whatsapp, public_phone').eq('id', office.id).maybeSingle()
      .then(({ data }) => setNoContact(!!data && !data.public_whatsapp && !data.public_phone));
  }, [office.id]);

  const set = async (on: boolean) => {
    if (busy) return;
    if (on && !window.confirm(t('Switch on the public page? Anyone with the link can see the title, price, neighborhood and city, details, description and your office contact. The exact address and the owner details are never shown.'))) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('properties').update({ is_published: on }).eq('id', property.id).select('id');
    setBusy(false);
    if (error) { setError(publishError(error.message)); return; }
    if (!data?.length) { setError(t('You do not have permission to change this property.')); return; }
    onChanged(); loadState();
  };

  const canPublish = property.status === 'available' || property.status === 'reserved';
  const url = PUBLIC_SITE ? propertyUrl(office.slug, property.reference, lang) : '';
  const priceText = property.price_cents === null ? '' : ` · ${formatMad(property.price_cents)} ${priceSuffix(property.purpose)}`.trimEnd();
  const shareText = `${property.title}${priceText}\n${url}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt(t('Copy this link'), url); }
  };

  const badge = state === 'live' ? { cls: 'bg-ok/10 text-ok', text: t('Online') }
    : state === 'hidden_mandate' || state === 'hidden_status' ? { cls: 'bg-warn/10 text-warn', text: t('Switched on, not visible') }
    : { cls: 'bg-surface-3 text-muted', text: t('Offline') };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4" /> {t('Public page')}</h3>
        {state !== undefined && state !== null && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.text}</span>}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
        {state === 'offline' || state === undefined || state === null ? (
          <p className="text-sm text-muted">{t('Share this property with clients through a link. They see the title, price, neighborhood and city, details and description. Never the exact address or the owner details.')}</p>
        ) : state === 'hidden_mandate' ? (
          <p className="text-sm font-semibold text-warn">{t('The page is switched on but nobody can see it, because this property has no active mandate. Add or renew the mandate above.')}</p>
        ) : state === 'hidden_status' ? (
          <p className="text-sm font-semibold text-warn">{t('The page is switched on but nobody can see it because of the status of this property.')}</p>
        ) : (
          <p className="text-sm text-muted">{t('Anyone with the link can see this page.')}</p>
        )}

        {noContact && (state === 'offline' || state === 'live') && (
          <p className="text-sm text-warn">{t('Your office has no WhatsApp or phone number on the public page yet. Add it under Team, so clients can reach you.')}</p>
        )}

        {state === 'live' && (
          PUBLIC_SITE ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Language of the link')}>
                <span className="me-1 text-xs font-semibold text-muted">{t('Language of the link')}</span>
                {SHARE_LANGS.map(l => (
                  <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
                ))}
              </div>
              <input className={`${inputCls} text-sm`} dir="ltr" readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label={t('Link to the public page')} />
              <div className="flex flex-wrap gap-2">
                <Btn tone="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 sm:px-4"><ExternalLink className="h-4 w-4" /> {t('Open')}</a>
                <a href={whatsappShareUrl(shareText)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm font-semibold text-ok transition hover:bg-ok/15 sm:px-4"><MessageCircle className="h-4 w-4" /> {t('Share on WhatsApp')}</a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('The address of the public site is not set yet (VITE_PUBLIC_SITE_URL, see the README), so there is no link to show.')}</p>
          )
        )}

        {canWrite && (
          property.is_published
            ? <Btn tone="ghost" onClick={() => set(false)} disabled={busy}>{t('Take offline')}</Btn>
            : <Btn tone="brand" onClick={() => set(true)} disabled={busy || !canPublish}>{t('Switch on public page')}</Btn>
        )}
        {canWrite && !property.is_published && !canPublish && (
          <p className="text-xs text-muted">{t('Only available or reserved properties can be published.')}</p>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
