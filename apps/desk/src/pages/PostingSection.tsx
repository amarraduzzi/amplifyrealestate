import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Megaphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { SITES, adFields, adText, adTitle, loadPostings, setOnline, setRemoved, siteName, type AdLang, type PostingRow, type Site } from '../lib/postings';
import { planError } from '../lib/plan';
import { Btn, inputCls } from '../components/ui';
import { AdImages } from '../components/AdImages';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const dateText = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(`${d}T00:00:00`));

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); } catch { /* no clipboard */ } }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-semibold ring-1 ring-line/10 transition hover:text-brand">
      {done ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />} {done ? t('Copied') : label}
    </button>
  );
}

/** Advertise a property on Mubawab, Avito, Facebook and others: ready-made texts and photos, and where it is online. */
export function PostingSection({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [rows, setRows] = useState<PostingRow[] | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState<Site>('mubawab');
  const [lang, setLang] = useState<AdLang>(getLang() === 'ar' ? 'ar' : 'fr');
  const [contact, setContact] = useState<{ public_whatsapp: string | null; public_phone: string | null }>({ public_whatsapp: null, public_phone: null });
  const [photos, setPhotos] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await loadPostings(property.id)), [property.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      const [o, ph] = await Promise.all([
        supabase.from('organizations').select('public_whatsapp, public_phone').eq('id', office.id).maybeSingle(),
        supabase.from('property_photos').select('id, org_id, property_id').eq('property_id', property.id)
          .order('is_cover', { ascending: false }).order('created_at').order('id'),
      ]);
      if (!live) return;
      if (o.data) setContact(o.data as typeof contact);
      setPhotos(((ph.data ?? []) as { id: string; org_id: string; property_id: string }[]).map(p => `${p.org_id}/${p.property_id}/${p.id}`));
    })();
    return () => { live = false; };
  }, [open, office.id, property.id]);

  const current = rows?.find(r => r.site === site);
  useEffect(() => { setUrl(current?.url ?? ''); }, [current?.id, current?.url, site]);

  const info = SITES.find(s => s.id === site)!;
  const off = { name: office.name, slug: office.slug, ...contact };
  const title = useMemo(() => adTitle(property, lang), [property, lang]);
  const text = useMemo(() => adText(property, lang, site, off), [property, lang, site, off.name, off.slug, contact]); // eslint-disable-line react-hooks/exhaustive-deps
  const fields = useMemo(() => adFields(property, lang), [property, lang]);
  const online = (rows ?? []).filter(r => r.status === 'online');

  if (rows === undefined) return null;
  const tableMissing = rows === null;

  const markOnline = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const err = await setOnline(office.id, property.id, site, url, current);
    setBusy(false);
    if (err) setError(planError(err)); else load();
  };
  const markRemoved = async () => {
    if (busy || !current) return;
    setBusy(true); setError(null);
    const err = await setRemoved(current);
    setBusy(false);
    if (err) setError(planError(err)); else load();
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4" /> {t('Advertise on portals')}</h3>
        <Btn tone="ghost" onClick={() => setOpen(o => !o)}>{open ? t('Close') : t('Prepare an ad')}</Btn>
      </div>
      <p className="mt-1 text-sm text-muted">
        {online.length > 0
          ? t('Online on: {sites}', { sites: online.map(r => siteName(r.site)).join(', ') })
          : t('Not advertised anywhere yet. Prepare the text and photos once, paste them on each site.')}
      </p>

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {SITES.map(s => {
              const on = rows?.find(r => r.site === s.id && r.status === 'online');
              return (
                <button key={s.id} type="button" role="tab" aria-selected={site === s.id} onClick={() => setSite(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${site === s.id ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-ok" />}{s.id === 'other' ? t('Other') : s.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Language of the ad')}>
            <span className="me-1 text-xs font-semibold text-muted">{t('Language of the ad')}</span>
            {(['fr', 'ar'] as const).map(l => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${lang === l ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{l}</button>
            ))}
            {info.newUrl && (
              <a href={info.newUrl} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                {t('Open {site}', { site: info.name })} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{t('Title')} <span className="tabular font-normal text-muted">{title.length}</span></span>
              <CopyBtn text={title} label={t('Copy')} />
            </div>
            <p dir={lang === 'ar' ? 'rtl' : 'ltr'} className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold">{title}</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{t('Description')}</span>
              <CopyBtn text={text} label={t('Copy')} />
            </div>
            <textarea readOnly dir={lang === 'ar' ? 'rtl' : 'ltr'} value={text} rows={10} className={`${inputCls} text-sm`} />
            <p className="mt-1 text-xs text-muted">
              {info.social
                ? t('With your contact details and the link to the public page.')
                : t('Without phone number or link: most portals refuse them and send the contact through their own form.')}
              {!property.description?.trim() && ` ${t('Tip: add a description to the property for a better ad.')}`}
            </p>
          </div>

          {!info.social && fields.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold">{t('Fields of the form')}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {fields.map(f => (
                  <li key={f.label} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate"><span className="text-muted">{f.label}:</span> <span dir="auto" className="font-semibold">{f.value}</span></span>
                    <CopyBtn text={f.value} label={t('Copy')} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AdImages property={property} site={site} social={info.social} lang={lang} photos={photos} office={{ name: office.name, phone: contact.public_whatsapp || contact.public_phone }} />

          <div className="border-t border-line/10 pt-3">
            {tableMissing ? (
              <p className="text-xs text-muted">{t('Run the SQL of etappe 6d to keep track of where the property is online.')}</p>
            ) : current?.status === 'online' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{t('Online since {date}', { date: dateText(current.posted_on) })}</span>
                {current.url && <a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">{t('View ad')} <ExternalLink className="h-3.5 w-3.5" /></a>}
                {canWrite && <Btn tone="ghost" disabled={busy} onClick={markRemoved}>{t('Taken offline')}</Btn>}
              </div>
            ) : canWrite ? (
              <div className="space-y-2">
                {current?.status === 'removed' && current.removed_on && <p className="text-xs text-muted">{t('Taken offline on {date}', { date: dateText(current.removed_on) })}</p>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input className={inputCls} value={url} onChange={e => setUrl(e.target.value)} maxLength={500} inputMode="url"
                    placeholder={t('Link to the ad (optional)')} aria-label={t('Link to the ad (optional)')} />
                  <Btn tone="brand" disabled={busy} onClick={markOnline} className="shrink-0">{t('It is online on {site}', { site: site === 'other' ? t('Other') : info.name })}</Btn>
                </div>
              </div>
            ) : null}
            {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
