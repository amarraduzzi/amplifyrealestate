import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Globe2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { PUBLIC_SITE, officeUrl } from '../lib/publicSite';
import { Btn, Card, Field, inputCls } from './ui';
import { friendly } from '../lib/errors';

type Site = { site_tagline: string; site_about: string; site_services: string; site_areas: string; custom_domain: string };
const COLS = 'site_tagline, site_about, site_services, site_areas, custom_domain, site_texts_tr, site_hero_title, site_hero_sub';
type TrLang = 'en' | 'ar' | 'nl';
type TrKey = 'tagline' | 'hero_title' | 'hero_sub' | 'about' | 'services';
type Tr = Partial<Record<TrLang, Partial<Record<TrKey, string>>>>;
const TR_LANGS: { id: 'fr' | TrLang; label: string }[] = [
  { id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'ar', label: 'العربية' }, { id: 'nl', label: 'Nederlands' },
];
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const cleanDomain = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

/** The texts of the office website, and an own domain name for it. */
export function WebsiteSettings({ office, canManage }: { office: Office; canManage: boolean }) {
  const [s, setS] = useState<Site | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lang, setLang] = useState<'fr' | TrLang>('fr');
  const [tr, setTr] = useState<Tr>({});
  const [hero, setHero] = useState<{ title: string; sub: string }>({ title: '', sub: '' });

  useEffect(() => {
    supabase.from('organizations').select(COLS).eq('id', office.id).maybeSingle().then(({ data, error }) => {
      if (error) { setS(null); return; } // etappe 6g not installed yet
      const d = (data ?? {}) as Partial<Record<keyof Site | 'site_hero_title' | 'site_hero_sub', string | null>> & { site_texts_tr?: Tr | null };
      setTr(d.site_texts_tr ?? {}); setHero({ title: d.site_hero_title ?? '', sub: d.site_hero_sub ?? '' });
      setS({ site_tagline: d.site_tagline ?? '', site_about: d.site_about ?? '', site_services: d.site_services ?? '', site_areas: d.site_areas ?? '', custom_domain: d.custom_domain ?? '' });
    });
  }, [office.id]);
  if (!s) return null;

  const set = (patch: Partial<Site>) => { setSaved(false); setS(x => ({ ...(x as Site), ...patch })); };
  const tv = (k: TrKey) => (lang === 'fr' ? '' : tr[lang]?.[k] ?? '');
  const setTv = (k: TrKey, v: string) => { if (lang === 'fr') return; setSaved(false); setTr(x => ({ ...x, [lang]: { ...(x[lang] ?? {}), [k]: v } })); };
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const domain = cleanDomain(s.custom_domain);
    if (domain && !DOMAIN.test(domain)) { setError(t('Enter a domain name like www.your-agency.ma (without http).')); return; }
    setBusy(true); setError(null);
    const n = (x: string) => x.trim() || null;
    // only keep translations that have text
    const clean: Tr = {};
    for (const [l, v] of Object.entries(tr) as [TrLang, Partial<Record<TrKey, string>>][]) {
      const kept = Object.fromEntries(Object.entries(v ?? {}).map(([k, x]) => [k, (x ?? '').trim()]).filter(([, x]) => x));
      if (Object.keys(kept).length) clean[l] = kept;
    }
    const { data, error } = await supabase.from('organizations').update({
      site_tagline: n(s.site_tagline), site_about: n(s.site_about), site_services: n(s.site_services), site_areas: n(s.site_areas), custom_domain: domain || null,
      site_texts_tr: clean,
    }).eq('id', office.id).select('id');
    setBusy(false);
    if (error) { setError(/organizations_custom_domain_idx|duplicate/.test(error.message) ? t('This domain name is already used by another office.') : friendly(error)); return; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return; }
    set({ custom_domain: domain }); setSaved(true);
  };

  const link = PUBLIC_SITE ? officeUrl(office.slug, getLang() === 'ar' ? 'ar' : getLang() === 'en' ? 'en' : 'fr') : null;
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-display flex items-center gap-2 text-lg font-semibold"><Globe2 className="h-5 w-5 text-brand" /> {t('Website')}</h2>
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">{t('Open the website')} <ExternalLink className="h-4 w-4" /></a>}
      </div>
      <p className="mt-1 text-sm text-muted">{t('Your office page becomes a full website: your properties online with search, who you are, your services and a contact form. Write the texts in French: that is what most visitors read.')}</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Language of the texts')}>
          {TR_LANGS.map(l => (
            <button key={l.id} type="button" role="tab" aria-selected={lang === l.id} onClick={() => setLang(l.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${lang === l.id ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'}`}>
              {l.label}{l.id !== 'fr' && Object.values(tr[l.id] ?? {}).some(x => x?.trim()) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {lang !== 'fr' && (
          <fieldset disabled={!canManage} className="space-y-4" dir={dir}>
            <p className="text-sm text-muted" dir="ltr">{t('Translate the French texts for visitors who choose this language. A field left empty shows the French text.')}</p>
            <Field label={t('Slogan')}><input className={inputCls} value={tv('tagline')} onChange={e => setTv('tagline', e.target.value)} maxLength={140} placeholder={s.site_tagline} /></Field>
            <Field label={t('Title on the photo')}><input className={inputCls} value={tv('hero_title')} onChange={e => setTv('hero_title', e.target.value)} maxLength={90} placeholder={hero.title} /></Field>
            <Field label={t('Sentence under the title')}><input className={inputCls} value={tv('hero_sub')} onChange={e => setTv('hero_sub', e.target.value)} maxLength={180} placeholder={hero.sub} /></Field>
            <Field label={t('About us')}><textarea className={inputCls} rows={5} value={tv('about')} onChange={e => setTv('about', e.target.value)} maxLength={2000} placeholder={s.site_about} /></Field>
            <Field label={t('Services')} hint={t('One per line.')}><textarea className={inputCls} rows={4} value={tv('services')} onChange={e => setTv('services', e.target.value)} maxLength={1500} placeholder={s.site_services} /></Field>
          </fieldset>
        )}
        <fieldset disabled={!canManage} className={`space-y-4 ${lang !== 'fr' ? 'hidden' : ''}`}>
          <Field label={t('Slogan')} hint={t('One short sentence under your name.')}><input className={inputCls} value={s.site_tagline} onChange={e => set({ site_tagline: e.target.value })} maxLength={140} placeholder="Votre agence de confiance à Rabat" /></Field>
          <Field label={t('Neighborhoods where you work')}><input className={inputCls} value={s.site_areas} onChange={e => set({ site_areas: e.target.value })} maxLength={300} placeholder="Agdal, Hay Riad, Souissi" /></Field>
          <Field label={t('About us')}><textarea className={inputCls} rows={4} value={s.site_about} onChange={e => set({ site_about: e.target.value })} maxLength={2000} /></Field>
          <Field label={t('Services')} hint={t('One per line.')}><textarea className={inputCls} rows={4} value={s.site_services} onChange={e => set({ site_services: e.target.value })} maxLength={1500} placeholder={'Vente et achat\nLocation longue durée\nGestion locative'} /></Field>
          <Field label={t('Own domain name (optional)')} hint={t('Ask Amplify to connect the domain first; then fill it in here.')}>
            <input className={inputCls} dir="ltr" value={s.custom_domain} onChange={e => set({ custom_domain: e.target.value })} maxLength={200} placeholder="www.atlas-immo.ma" />
          </Field>
        </fieldset>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        {canManage && (
          <div className="flex items-center gap-3">
            <Btn tone="brand" type="submit" disabled={busy}>{t('Save')}</Btn>
            {saved && <span className="text-sm font-semibold text-ok">{t('Saved')}</span>}
          </div>
        )}
      </form>
    </Card>
  );
}
