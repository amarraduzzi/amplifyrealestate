import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Camera, Check, ExternalLink, Monitor, Plus, Smartphone, Star, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import { isSolo, type Office } from '../lib/types';
import { photoUrl } from '../lib/photos';
import { PUBLIC_SITE, officeUrl } from '../lib/publicSite';
import { BLOCKS, COLORS, THEMES, blockLabel, removeSiteImage, themeText, uploadSiteImage, type Block, type Theme } from '../lib/site';
import { LANGS, langLabel } from '../lib/showcase';
import { friendly } from '../lib/errors';
import { Btn, Card, Field, inputCls } from '../components/ui';
import { WebsiteSettings } from '../components/WebsiteSettings';
import { AgentProfile } from '../components/AgentProfile';
import { PublicProfile } from './PublicProfile';

type Tab = 'style' | 'home' | 'blocks' | 'team' | 'reviews' | 'texts' | 'contact';
type Site = { site_theme: Theme; site_color: string | null; site_logo: string | null; site_hero: string | null; site_hero_title: string | null; site_hero_sub: string | null; site_blocks: Block[] };
type Member = { id: string; name: string; role: string | null; photo: string | null; whatsapp: string | null; langs: string[]; sort: number };
type Review = { id: string; author: string; place: string | null; body: string; rating: number; sort: number };
const COLS = 'site_theme, site_color, site_logo, site_hero, site_hero_title, site_hero_sub, site_blocks';

const Msg = ({ error, saved }: { error: string | null; saved: boolean }) => (<>
  {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
  {saved && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{t('Saved. The preview is updated.')}</p>}
</>);

/** Amplify Vitrine: the office builds and keeps its own website, with a live preview next to it. */
export function SiteEditor({ office, onSelfChanged }: { office: Office; onSelfChanged: () => void }) {
  const canManage = office.role === 'owner' || office.role === 'manager';
  const [tab, setTab] = useState<Tab>('style');
  const [site, setSite] = useState<Site | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const refresh = () => setTick(x => x + 1);

  useEffect(() => {
    supabase.from('organizations').select(COLS).eq('id', office.id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setSite(null); return; }
      setSite(data as Site);
    });
  }, [office.id]);

  const lang = getLang() === 'ar' ? 'ar' : getLang() === 'en' ? 'en' : 'fr';
  const url = PUBLIC_SITE ? officeUrl(office.slug, lang) : '';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'style', label: t('Style') }, { id: 'home', label: t('Top of the page') }, { id: 'blocks', label: t('Blocks') },
    { id: 'team', label: t('Team') }, { id: 'reviews', label: t('Reviews') }, { id: 'texts', label: t('Texts and domain') },
    { id: 'contact', label: isSolo(office) ? t('Your profile') : t('Contact') },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Amplify Vitrine</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('My website')}</h1>
          <p className="text-sm text-muted">{t('Your properties appear on it by themselves. Here you choose the look, the texts and what is shown.')}</p>
        </div>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg"><ExternalLink className="h-4 w-4" /> {t('Open my website')}</a>}
      </div>
      {!canManage && <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Only owners and managers can change the website.')}</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="min-w-0">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist">
            {tabs.map(x => (
              <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === x.id ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{x.label}</button>
            ))}
          </div>
          <div className="mt-4">
            {site === undefined && <p className="py-10 text-center text-muted">…</p>}
            {site === null && <Card><p className="text-sm text-muted">{t('The website settings could not be loaded. Run the latest SQL update first.')}</p></Card>}
            {site && tab === 'style' && <StyleTab office={office} site={site} setSite={setSite} canManage={canManage} onSaved={refresh} />}
            {site && tab === 'home' && <HomeTab office={office} site={site} setSite={setSite} canManage={canManage} onSaved={refresh} />}
            {site && tab === 'blocks' && <BlocksTab office={office} site={site} setSite={setSite} canManage={canManage} onSaved={refresh} />}
            {tab === 'team' && <TeamTab office={office} canManage={canManage} onSaved={refresh} />}
            {tab === 'reviews' && <ReviewsTab office={office} canManage={canManage} onSaved={refresh} />}
            {tab === 'texts' && <div className="-mt-6"><WebsiteSettings office={office} canManage={canManage} /></div>}
            {tab === 'contact' && <div className="-mt-6"><PublicProfile office={office} canManage={canManage} onSlugChanged={onSelfChanged} /><AgentProfile office={office} canManage={canManage} /></div>}
          </div>
        </div>

        {url && (
          <div className="hidden lg:sticky lg:top-6 lg:block">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{t('Preview')}</p>
              <div className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line/10">
                <button type="button" onClick={() => setDevice('phone')} aria-pressed={device === 'phone'} aria-label={t('Phone')} className={`grid h-8 w-8 place-items-center rounded-full ${device === 'phone' ? 'bg-ink text-bg' : 'text-muted'}`}><Smartphone className="h-4 w-4" /></button>
                <button type="button" onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'} aria-label={t('Computer')} className={`grid h-8 w-8 place-items-center rounded-full ${device === 'desktop' ? 'bg-ink text-bg' : 'text-muted'}`}><Monitor className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-hidden rounded-[2rem] bg-surface-3 p-2 ring-1 ring-line/10">
              {device === 'phone'
                ? <iframe key={`p${tick}`} title={t('Preview')} src={`${url}&preview=${tick}`} className="mx-auto block h-[720px] w-[375px] rounded-[1.6rem] bg-white" />
                : <div className="h-[720px] overflow-hidden rounded-[1.6rem] bg-white"><iframe key={`d${tick}`} title={t('Preview')} src={`${url}&preview=${tick}`} className="h-[1200px] w-[1280px] origin-top-left scale-[0.5]" /></div>}
            </div>
            <p className="mt-2 text-xs text-muted">{t('The preview shows what is saved. Save to see a change.')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

type TabProps = { office: Office; site: Site; setSite: (s: Site) => void; canManage: boolean; onSaved: () => void };

function useSave(office: Office, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useCallback(async (fields: Record<string, unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    const { data, error } = await supabase.from('organizations').update(fields).eq('id', office.id).select('id');
    setBusy(false);
    if (error) { setError(friendly(error)); return false; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return false; }
    setSaved(true); onSaved(); return true;
  }, [office.id, onSaved]);
  return { busy, error, saved, setError, setSaved, save, setBusy };
}

function ImagePick({ label, hint, value, round, onPick, onRemove, disabled }: { label: string; hint?: string; value: string | null; round?: boolean; onPick: (f: File) => void; onRemove?: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-2 flex items-center gap-3">
        {value
          ? <img src={photoUrl(value, true)} alt="" className={`h-20 bg-white object-contain ring-1 ring-line/10 ${round ? 'w-20 rounded-full object-cover' : 'w-32 rounded-xl'}`} />
          : <span className={`grid h-20 place-items-center bg-surface-2 text-muted ${round ? 'w-20 rounded-full' : 'w-32 rounded-xl'}`}><Camera className="h-6 w-6" /></span>}
        <div className="flex flex-wrap gap-2">
          <Btn type="button" tone="ghost" disabled={disabled} onClick={() => ref.current?.click()}><Camera className="h-4 w-4" /> {value ? t('Change') : t('Add')}</Btn>
          {value && onRemove && <Btn type="button" tone="ghost" disabled={disabled} onClick={onRemove}><Trash2 className="h-4 w-4" /> {t('Remove')}</Btn>}
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

function StyleTab({ office, site, setSite, canManage, onSaved }: TabProps) {
  const s = useSave(office, onSaved);
  const [theme, setTheme] = useState<Theme>(site.site_theme);
  const [color, setColor] = useState<string | null>(site.site_color);
  const effective = color ?? THEMES.find(x => x.id === theme)!.accent;

  const logo = async (f: File) => {
    s.setBusy(true); s.setError(null);
    try {
      const base = await uploadSiteImage(office.id, f, 800);
      const old = site.site_logo;
      if (await s.save({ site_logo: base })) { setSite({ ...site, site_logo: base }); await removeSiteImage(old); } else await removeSiteImage(base);
    } catch (e) { s.setError(friendly(e instanceof Error ? e.message : String(e))); s.setBusy(false); }
  };
  const dropLogo = async () => { const old = site.site_logo; if (await s.save({ site_logo: null })) { setSite({ ...site, site_logo: null }); await removeSiteImage(old); } };
  const saveStyle = async () => { if (await s.save({ site_theme: theme, site_color: color })) setSite({ ...site, site_theme: theme, site_color: color }); };

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold">{t('Style of your website')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {THEMES.map(th => (
            <button key={th.id} type="button" disabled={!canManage} onClick={() => { setTheme(th.id); s.setSaved(false); }} aria-pressed={theme === th.id}
              className={`overflow-hidden rounded-2xl text-start ring-2 transition ${theme === th.id ? 'ring-brand' : 'ring-line/10 hover:ring-line/25'}`}>
              <span className="block p-3" style={{ background: th.bg }}>
                <span className="block h-2 w-10 rounded-full" style={{ background: color ?? th.accent }} />
                <span className="mt-2 block h-12 rounded-lg" style={{ background: th.surface, border: `1px solid ${th.ink}14` }} />
                <span className="mt-2 block h-2 w-16 rounded-full" style={{ background: th.ink, opacity: 0.7 }} />
              </span>
              <span className="block bg-surface p-3">
                <span className="flex items-center justify-between font-semibold">{th.name}{theme === th.id && <Check className="h-4 w-4 text-brand" />}</span>
                <span className="block text-xs text-muted">{themeText(th)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">{t('Main color')}</p>
        <p className="text-xs text-muted">{t('Buttons and accents. Pick the color of your logo.')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {COLORS.map(c => (
            <button key={c} type="button" disabled={!canManage} onClick={() => { setColor(c); s.setSaved(false); }} aria-label={c} aria-pressed={effective.toLowerCase() === c.toLowerCase()}
              className={`grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface ${effective.toLowerCase() === c.toLowerCase() ? 'ring-ink' : 'ring-transparent'}`} style={{ background: c }}>
              {effective.toLowerCase() === c.toLowerCase() && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
            <input type="color" value={effective} disabled={!canManage} onChange={e => { setColor(e.target.value); s.setSaved(false); }} className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
            {t('Own color')}
          </label>
          {color && <button type="button" onClick={() => { setColor(null); s.setSaved(false); }} className="text-sm font-semibold text-muted hover:text-ink">{t('Default of the style')}</button>}
        </div>
      </div>
      <Btn tone="brand" disabled={!canManage || s.busy} onClick={saveStyle}>{s.busy ? '…' : t('Save the style')}</Btn>
      <div className="border-t border-line/[0.08] pt-5">
        <ImagePick label={t('Logo')} hint={t('Shown at the top of every page, on a white background. A JPG or PNG with a white or light background works best.')}
          value={site.site_logo} onPick={logo} onRemove={dropLogo} disabled={!canManage || s.busy} />
      </div>
      <Msg error={s.error} saved={s.saved} />
    </Card>
  );
}

function HomeTab({ office, site, setSite, canManage, onSaved }: TabProps) {
  const s = useSave(office, onSaved);
  const [title, setTitle] = useState(site.site_hero_title ?? '');
  const [sub, setSub] = useState(site.site_hero_sub ?? '');
  const hero = async (f: File) => {
    s.setBusy(true); s.setError(null);
    try {
      const base = await uploadSiteImage(office.id, f, 2200);
      const old = site.site_hero;
      if (await s.save({ site_hero: base })) { setSite({ ...site, site_hero: base }); await removeSiteImage(old); } else await removeSiteImage(base);
    } catch (e) { s.setError(friendly(e instanceof Error ? e.message : String(e))); s.setBusy(false); }
  };
  const dropHero = async () => { const old = site.site_hero; if (await s.save({ site_hero: null })) { setSite({ ...site, site_hero: null }); await removeSiteImage(old); } };
  const saveTexts = async () => {
    const f = { site_hero_title: title.trim() || null, site_hero_sub: sub.trim() || null };
    if (await s.save(f)) setSite({ ...site, ...f });
  };
  return (
    <Card className="space-y-5">
      <ImagePick label={t('Large photo at the top')} hint={t('Your most beautiful property or your street. Without a photo, the cover of your newest property is used.')}
        value={site.site_hero} onPick={hero} onRemove={dropHero} disabled={!canManage || s.busy} />
      <Field label={t('Title on the photo')} hint={t('Short and strong. Without a title, the name of your office is shown.')}>
        <input className={inputCls} value={title} onChange={e => { setTitle(e.target.value); s.setSaved(false); }} maxLength={90} placeholder="Votre maison à Rabat commence ici" disabled={!canManage} />
      </Field>
      <Field label={t('Sentence under the title')}>
        <input className={inputCls} value={sub} onChange={e => { setSub(e.target.value); s.setSaved(false); }} maxLength={180} placeholder="Achat, vente et location à Agdal, Souissi et Harhoura" disabled={!canManage} />
      </Field>
      <Btn tone="brand" disabled={!canManage || s.busy} onClick={saveTexts}>{s.busy ? '…' : t('Save')}</Btn>
      <Msg error={s.error} saved={s.saved} />
    </Card>
  );
}

function BlocksTab({ office, site, setSite, canManage, onSaved }: TabProps) {
  const s = useSave(office, onSaved);
  const [order, setOrder] = useState<Block[]>(() => [...site.site_blocks, ...BLOCKS.filter(b => !site.site_blocks.includes(b))]);
  const [on, setOn] = useState<Set<Block>>(() => new Set(site.site_blocks));
  const move = (i: number, d: -1 | 1) => setOrder(o => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; s.setSaved(false); return n; });
  const toggle = (b: Block) => setOn(x => { const n = new Set(x); if (n.has(b)) n.delete(b); else n.add(b); s.setSaved(false); return n; });
  const saveBlocks = async () => {
    const blocks = order.filter(b => on.has(b) || b === 'listings');
    if (await s.save({ site_blocks: blocks })) setSite({ ...site, site_blocks: blocks });
  };
  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted">{t('Choose what is on your home page, and in which order. Your properties are always shown.')}</p>
      <ul className="space-y-1.5">
        {order.map((b, i) => (
          <li key={b} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-line/10 ${on.has(b) ? 'bg-surface' : 'bg-surface-2 text-muted'}`}>
            <button type="button" role="switch" aria-checked={on.has(b) || b === 'listings'} disabled={!canManage || b === 'listings'} onClick={() => toggle(b)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on.has(b) || b === 'listings' ? 'bg-brand' : 'bg-surface-3'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on.has(b) || b === 'listings' ? 'start-[1.375rem]' : 'start-0.5'}`} />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{blockLabel(b)}</span>
            <button type="button" disabled={!canManage || i === 0} onClick={() => move(i, -1)} aria-label={t('Up')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" disabled={!canManage || i === order.length - 1} onClick={() => move(i, 1)} aria-label={t('Down')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <Btn tone="brand" disabled={!canManage || s.busy} onClick={saveBlocks}>{s.busy ? '…' : t('Save the blocks')}</Btn>
      <Msg error={s.error} saved={s.saved} />
    </Card>
  );
}

function TeamTab({ office, canManage, onSaved }: { office: Office; canManage: boolean; onSaved: () => void }) {
  const [rows, setRows] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [role, setRole] = useState(''); const [wa, setWa] = useState('');
  const [langs, setLangs] = useState<string[]>([]); const [photo, setPhoto] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('site_team').select('id, name, role, photo, whatsapp, langs, sort').eq('org_id', office.id).order('sort').order('created_at');
    if (error) setError(friendly(error)); else setRows((data ?? []) as Member[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (name.trim().length < 2) { setError(t('Please enter a name of at least 2 letters.')); return; }
    if (wa.trim() && wa.replace(/\D/g, '').length < 8) { setError(t('Please enter a valid WhatsApp number, for example 06 12 34 56 78.')); return; }
    setBusy(true); setError(null);
    try {
      const p = photo ? await uploadSiteImage(office.id, photo, 700) : null;
      const { error } = await supabase.from('site_team').insert({ org_id: office.id, name: name.trim(), role: role.trim() || null, whatsapp: wa.trim() || null, langs, photo: p, sort: rows.length });
      if (error) { await removeSiteImage(p); throw new Error(error.message); }
      setName(''); setRole(''); setWa(''); setLangs([]); setPhoto(null);
      await load(); onSaved();
    } catch (e) { setError(friendly(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const remove = async (m: Member) => {
    if (!window.confirm(t('Remove {name} from the website?', { name: m.name }))) return;
    const { error } = await supabase.from('site_team').delete().eq('id', m.id);
    if (error) { setError(friendly(error)); return; }
    await removeSiteImage(m.photo); await load(); onSaved();
  };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= rows.length) return;
    const a = rows[i], b = rows[j];
    await Promise.all([supabase.from('site_team').update({ sort: j }).eq('id', a.id), supabase.from('site_team').update({ sort: i }).eq('id', b.id)]);
    await load(); onSaved();
  };

  return (
    <Card className="space-y-5">
      <p className="text-sm text-muted">{t('Faces build trust. Each person gets a photo, a role and, if you want, their own WhatsApp button.')}</p>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              {m.photo ? <img src={photoUrl(m.photo, true)} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-muted"><UserRound className="h-5 w-5" /></span>}
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{m.name}</span><span className="block truncate text-xs text-muted">{[m.role, m.langs.map(langLabel).join(', ')].filter(Boolean).join(' · ')}</span></span>
              {canManage && <>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('Up')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t('Down')} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(m)} aria-label={t('Remove')} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button>
              </>}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="space-y-3 rounded-2xl ring-1 ring-line/10 p-4">
          <p className="font-semibold">{t('Add a person')}</p>
          <div className="flex items-center gap-3">
            {photo ? <img src={URL.createObjectURL(photo)} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-muted"><Camera className="h-5 w-5" /></span>}
            <Btn type="button" tone="ghost" onClick={() => file.current?.click()}><Camera className="h-4 w-4" /> {photo ? t('Change photo') : t('Add a photo')}</Btn>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Name')}><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={80} /></Field>
            <Field label={t('Role')}><input className={inputCls} value={role} onChange={e => setRole(e.target.value)} maxLength={80} placeholder={t('Real estate advisor')} /></Field>
            <Field label={t('WhatsApp (optional)')}><input className={inputCls} dir="ltr" inputMode="tel" value={wa} onChange={e => setWa(e.target.value)} placeholder="06 12 34 56 78" /></Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LANGS.map(l => (
              <button key={l} type="button" aria-pressed={langs.includes(l)} onClick={() => setLangs(x => (x.includes(l) ? x.filter(y => y !== l) : [...x, l]))}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${langs.includes(l) ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'}`}>{langLabel(l)}</button>
            ))}
          </div>
          <Btn tone="brand" disabled={busy} onClick={add}><Plus className="h-4 w-4" /> {busy ? '…' : t('Add to the website')}</Btn>
        </div>
      )}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </Card>
  );
}

function ReviewsTab({ office, canManage, onSaved }: { office: Office; canManage: boolean; onSaved: () => void }) {
  const [rows, setRows] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [author, setAuthor] = useState(''); const [place, setPlace] = useState(''); const [body, setBody] = useState(''); const [rating, setRating] = useState(5);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('site_reviews').select('id, author, place, body, rating, sort').eq('org_id', office.id).order('sort').order('created_at');
    if (error) setError(friendly(error)); else setRows((data ?? []) as Review[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (author.trim().length < 2) { setError(t('Please enter the name of the client.')); return; }
    if (body.trim().length < 10) { setError(t('The review is too short (at least 10 characters).')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from('site_reviews').insert({ org_id: office.id, author: author.trim(), place: place.trim() || null, body: body.trim(), rating, sort: rows.length });
    setBusy(false);
    if (error) { setError(friendly(error)); return; }
    setAuthor(''); setPlace(''); setBody(''); setRating(5); await load(); onSaved();
  };
  const remove = async (r: Review) => {
    if (!window.confirm(t('Remove this review?'))) return;
    const { error } = await supabase.from('site_reviews').delete().eq('id', r.id);
    if (error) { setError(friendly(error)); return; }
    await load(); onSaved();
  };
  const stars = (n: number, set?: (n: number) => void): ReactNode => (
    <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map(i => (
      <button key={i} type="button" disabled={!set} onClick={() => set?.(i)} aria-label={`${i}`} className={i <= n ? 'text-warn' : 'text-surface-3'}><Star className="h-4 w-4 fill-current" /></button>
    ))}</span>
  );
  return (
    <Card className="space-y-5">
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{t('Only real reviews from your clients, with their permission. Copy them from Google or WhatsApp. Invented reviews damage your name and are not allowed.')}</p>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">{r.author}{r.place ? <span className="font-normal text-muted"> · {r.place}</span> : null}</span>
                <span className="flex items-center gap-2">{stars(r.rating)}{canManage && <button type="button" onClick={() => remove(r)} aria-label={t('Remove')} className="text-danger"><Trash2 className="h-4 w-4" /></button>}</span>
              </div>
              <p className="mt-1 text-sm">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="space-y-3 rounded-2xl p-4 ring-1 ring-line/10">
          <p className="font-semibold">{t('Add a review')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Name of the client')}><input className={inputCls} value={author} onChange={e => setAuthor(e.target.value)} maxLength={80} placeholder="Famille Alaoui" /></Field>
            <Field label={t('Neighborhood or city (optional)')}><input className={inputCls} value={place} onChange={e => setPlace(e.target.value)} maxLength={80} placeholder="Agdal" /></Field>
          </div>
          <div><p className="mb-1 text-sm font-semibold">{t('Rating')}</p>{stars(rating, setRating)}</div>
          <Field label={t('Review')}><textarea className={inputCls} rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={500} /></Field>
          <Btn tone="brand" disabled={busy} onClick={add}><Plus className="h-4 w-4" /> {busy ? '…' : t('Add to the website')}</Btn>
        </div>
      )}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </Card>
  );
}
