import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { PUBLIC_SITE } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { waLink } from './ContactLinks';
import { Btn } from './ui';

type PortalLang = 'fr' | 'ar' | 'en' | 'nl';
type Owner = { id: string; full_name: string; phone: string | null; whatsapp: string | null };
type LinkRow = { person_id: string; token: string; lang: PortalLang; created_at: string; last_opened_at: string | null; open_count: number; expires_at: string };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const when = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(iso));
const portalUrl = (token: string, lang: PortalLang) => `${PUBLIC_SITE}/o/${token}?lang=${lang}`;

// The message goes to the owner in the owner's language (Dutch for owners living in the Netherlands or Belgium).
const MSG: Record<PortalLang, (name: string, office: string, url: string) => string> = {
  fr: (n, o, u) => `Bonjour ${n}, voici votre espace propriétaire chez ${o}. Vous y voyez à tout moment les visites, les offres, les loyers et les réparations de vos biens :\n${u}\nCe lien est personnel, merci de ne pas le partager.`,
  ar: (n, o, u) => `مرحبا ${n}، هذا فضاؤكم الخاص كمالك لدى ${o}. يمكنكم الاطلاع في أي وقت على المعاينات والعروض والكراء والإصلاحات الخاصة بعقاراتكم:\n${u}\nهذا الرابط شخصي، المرجو عدم مشاركته.`,
  en: (n, o, u) => `Hello ${n}, here is your owner page at ${o}. You can see the viewings, offers, rent and repairs of your properties at any time:\n${u}\nThis link is personal, please do not share it.`,
  nl: (n, o, u) => `Hallo ${n}, hier is uw eigenaarspagina bij ${o}. U ziet er altijd de bezichtigingen, biedingen, huur en reparaties van uw panden:\n${u}\nDeze link is persoonlijk, deel hem alstublieft niet.`,
};

/** In a property: a personal portal link for each owner, to send on WhatsApp. */
export function OwnerPortalSection({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [lang, setLang] = useState<PortalLang>('fr');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const pp = await supabase.from('property_parties').select('person_id').eq('property_id', property.id).eq('role', 'owner');
    const ids = ((pp.data ?? []) as { person_id: string }[]).map(x => x.person_id);
    if (!ids.length) { setOwners([]); return; }
    const [pe, ln] = await Promise.all([
      supabase.from('people').select('id, full_name, phone, whatsapp').in('id', ids),
      supabase.from('owner_links').select('person_id, token, lang, created_at, last_opened_at, open_count, expires_at').in('person_id', ids).is('revoked_at', null),
    ]);
    setOwners((pe.data ?? []) as Owner[]);
    setLinks(ln.error ? null : (ln.data ?? []) as LinkRow[]);
  }, [property.id]);
  useEffect(() => { load(); }, [load]);

  if (!owners || owners.length === 0 || links === null || !canWrite || !PUBLIC_SITE) return null;

  const create = async (o: Owner) => {
    setBusy(o.id); setError(null);
    const { error } = await supabase.rpc('create_owner_link', { p_person: o.id, p_lang: lang });
    setBusy(null);
    if (error) setError(planError(error.message)); else load();
  };
  const revoke = async (o: Owner) => {
    if (!window.confirm(t('Stop this link? The owner can no longer open the page until you send a new link.'))) return;
    setBusy(o.id); setError(null);
    const { error } = await supabase.rpc('revoke_owner_link', { p_person: o.id });
    setBusy(null);
    if (error) setError(planError(error.message)); else load();
  };
  const send = (o: Owner, l: LinkRow) => {
    const first = o.full_name.trim().split(/\s+/)[0] ?? '';
    const text = MSG[l.lang](first, office.name, portalUrl(l.token, l.lang));
    const n = o.whatsapp || o.phone;
    window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const copy = async (l: LinkRow) => {
    try { await navigator.clipboard.writeText(portalUrl(l.token, l.lang)); setCopied(l.person_id); window.setTimeout(() => setCopied(null), 1500); } catch { /* no clipboard */ }
  };

  return (
    <section>
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" /> {t('Owner portal')}</h3>
      <p className="mt-1 text-sm text-muted">{t('A personal page for the owner, without an account: activity, rent and repairs of all their properties with you. Ideal for owners abroad.')}</p>
      <ul className="mt-2 space-y-2">
        {owners.map(o => {
          const l = links.find(x => x.person_id === o.id);
          return (
            <li key={o.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{o.full_name}</p>
                {l && <span className="text-xs text-muted">{l.open_count ? t('Opened {n} times, last on {date}', { n: l.open_count, date: when(l.last_opened_at!) }) : t('Not opened yet')}</span>}
              </div>
              {l ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn tone="brand" onClick={() => send(o, l)}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')} ({l.lang.toUpperCase()})</Btn>
                  <Btn tone="ghost" onClick={() => copy(l)}>{copied === o.id ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />} {copied === o.id ? t('Copied') : t('Copy link')}</Btn>
                  <Btn tone="ghost" disabled={busy !== null} onClick={() => revoke(o)}>{t('Stop link')}</Btn>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="me-1 text-xs font-semibold text-muted">{t('Language of the owner')}</span>
                  {(['fr', 'ar', 'en', 'nl'] as const).map(x => (
                    <button key={x} type="button" aria-pressed={lang === x} onClick={() => setLang(x)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${lang === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{x}</button>
                  ))}
                  <Btn tone="brand" disabled={busy !== null} onClick={() => create(o)} className="ms-auto">{t('Make a portal link')}</Btn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
