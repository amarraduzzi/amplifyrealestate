import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { photoUrl } from '../lib/photos';
import { removeSiteImage, uploadSiteImage } from '../lib/site';
import { friendly } from '../lib/errors';
import { Btn, Card, Field, inputCls } from '../components/ui';
import { TileMap } from '../components/TileMap';

const split = (s: string | null | undefined) => (s ?? '').split(/[,·\n]/).map(x => x.trim()).filter(Boolean);
type Points = Record<string, [number, number]>;

/** Put each neighborhood on the map: search it, or tap the map. Only neighborhoods, never an address. */
export function MapTab({ office, canManage, onSaved }: { office: Office; canManage: boolean; onSaved: () => void }) {
  const [areas, setAreas] = useState<string[] | null>(null);
  const [points, setPoints] = useState<Points>({});
  const [city, setCity] = useState<string>('');
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('organizations').select('site_areas, site_area_points, city').eq('id', office.id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setAreas([]); return; }
      const d = data as { site_areas: string | null; site_area_points: Points | null; city: string | null };
      const list = split(d.site_areas);
      setAreas(list); setPoints(d.site_area_points ?? {}); setCity(d.city ?? '');
      setActive(list.find(a => !(d.site_area_points ?? {})[a]) ?? null);
    });
  }, [office.id]);

  const find = async (a: string) => {
    setBusy(a); setError(null);
    try {
      const q = encodeURIComponent([a, city, 'Maroc'].filter(Boolean).join(', '));
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ma&accept-language=fr&q=${q}`);
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (!j.length) { setError(t('“{area}” was not found. Tap the map to place it yourself.', { area: a })); setActive(a); }
      else { setPoints(p => ({ ...p, [a]: [Number(Number(j[0].lat).toFixed(5)), Number(Number(j[0].lon).toFixed(5))] })); setSaved(false); }
    } catch { setError(t('The search does not work right now. Tap the map to place it yourself.')); setActive(a); }
    setBusy(null);
  };
  const save = async () => {
    const clean: Points = {};
    for (const a of areas ?? []) if (points[a]) clean[a] = points[a];
    setBusy('save'); setError(null);
    const { data, error } = await supabase.from('organizations').update({ site_area_points: clean }).eq('id', office.id).select('id');
    setBusy(null);
    if (error) { setError(friendly(error)); return; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return; }
    setSaved(true); onSaved();
  };

  if (areas === null) return <p className="py-10 text-center text-muted">…</p>;
  if (areas.length === 0) return <Card><p className="text-sm text-muted">{t('First enter your neighborhoods under “Texts and domain” (for example: Agdal, Souissi, Harhoura). Then place them here on the map.')}</p></Card>;

  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted">{t('Each neighborhood gets one point on the map of your website, with the number of properties. Never the address of a property.')}</p>
      <ul className="space-y-1.5">
        {areas.map(a => (
          <li key={a} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ring-1 ${active === a ? 'bg-brand/[0.06] ring-brand/40' : 'bg-surface ring-line/10'}`}>
            <MapPin className={`h-4 w-4 ${points[a] ? 'text-brand' : 'text-muted'}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a} <span className="font-normal text-muted">{points[a] ? t('on the map') : t('not placed yet')}</span></span>
            {canManage && <>
              <Btn tone="ghost" className="!py-1.5" disabled={!!busy} onClick={() => find(a)}><Search className="h-4 w-4" /> {busy === a ? '…' : t('Search')}</Btn>
              <Btn tone="ghost" className="!py-1.5" onClick={() => setActive(a)}>{t('Tap on the map')}</Btn>
            </>}
          </li>
        ))}
      </ul>
      {active && canManage && <p className="rounded-xl bg-brand/[0.06] px-3 py-2 text-sm font-semibold text-brand">{t('Tap the map where “{area}” is.', { area: active })}</p>}
      <TileMap height={360} points={areas.filter(a => points[a]).map(a => ({ id: a, lat: points[a][0], lng: points[a][1], label: a, active: a === active, onClick: () => setActive(a) }))}
        onPick={canManage && active ? (lat, lng) => { setPoints(p => ({ ...p, [active]: [lat, lng] })); setSaved(false); } : undefined} />
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {saved && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{t('Saved. The preview is updated.')}</p>}
      <Btn tone="brand" disabled={!canManage || busy === 'save'} onClick={save}>{busy === 'save' ? '…' : t('Save the map')}</Btn>
    </Card>
  );
}

type Post = { id: string; slug: string; title: string; excerpt: string | null; body: string; cover: string | null; published: boolean; published_at: string | null; updated_at: string };
const toSlug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** Articles of the office: good for Google and for trust ("Acheter à Agdal en 2027", "Les frais de notaire"). */
export function BlogTab({ office, canManage, onSaved }: { office: Office; canManage: boolean; onSaved: () => void }) {
  const [rows, setRows] = useState<Post[] | null>(null);
  const [edit, setEdit] = useState<Post | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('site_posts').select('id, slug, title, excerpt, body, cover, published, published_at, updated_at').eq('org_id', office.id).order('updated_at', { ascending: false });
    if (error) { setRows([]); setError(friendly(error)); return; }
    setRows((data ?? []) as Post[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);
  const day = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(iso));

  if (edit) return <PostEditor office={office} post={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { load(); onSaved(); }} />;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('Short articles about your neighborhoods and about buying or renting. Clients find you on Google, and see that you know your job.')}</p>
        {canManage && <Btn tone="brand" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> {t('New article')}</Btn>}
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows?.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-muted">{t('No articles yet. Ideas: “Buying in Agdal in 2027”, “The costs at the notary explained”, “Renting out to MRE: what to know”.')}</p>}
      <ul className="space-y-2">
        {(rows ?? []).map(p => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            {p.cover ? <img src={photoUrl(p.cover, true)} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <span className="grid h-12 w-16 place-items-center rounded-lg bg-surface-3 text-muted"><Camera className="h-4 w-4" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.title}</span>
              <span className="block text-xs text-muted">{p.published ? `${t('Online')} · ${day(p.published_at ?? p.updated_at)}` : t('Draft')}</span>
            </span>
            {canManage && <Btn tone="ghost" className="!py-1.5" onClick={() => setEdit(p)}><Pencil className="h-4 w-4" /> {t('Edit')}</Btn>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PostEditor({ office, post, onClose, onSaved }: { office: Office; post: Post | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [cover, setCover] = useState<string | null>(post?.cover ?? null);
  const [published, setPublished] = useState(post?.published ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pickCover = async (f: File) => {
    setBusy(true); setError(null);
    try { const base = await uploadSiteImage(office.id, f, 1800); const old = cover; setCover(base); if (old && old !== post?.cover) await removeSiteImage(old); }
    catch (e) { setError(friendly(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const save = async () => {
    if (title.trim().length < 3) { setError(t('Please give the article a title.')); return; }
    setBusy(true); setError(null);
    const fields = { title: title.trim(), excerpt: excerpt.trim() || null, body: body.trim(), cover, published };
    let res;
    if (post) res = await supabase.from('site_posts').update(fields).eq('id', post.id).select('id');
    else {
      const base = toSlug(title) || 'article';
      res = await supabase.from('site_posts').insert({ org_id: office.id, slug: base.length >= 3 ? base : `${base}-article`, ...fields }).select('id');
      if (res.error && /duplicate|unique/.test(res.error.message)) res = await supabase.from('site_posts').insert({ org_id: office.id, slug: `${base}-${Math.random().toString(36).slice(2, 6)}`, ...fields }).select('id');
    }
    setBusy(false);
    if (res.error) { setError(friendly(res.error)); return; }
    if (post?.cover && post.cover !== cover) await removeSiteImage(post.cover);
    onSaved(); onClose();
  };
  const remove = async () => {
    if (!post || !window.confirm(t('Delete this article?'))) return;
    const { error } = await supabase.from('site_posts').delete().eq('id', post.id);
    if (error) { setError(friendly(error)); return; }
    await removeSiteImage(post.cover); onSaved(); onClose();
  };

  return (
    <Card className="space-y-4">
      <button type="button" onClick={onClose} className="text-sm font-semibold text-muted hover:text-ink">← {t('All articles')}</button>
      <Field label={t('Title')}><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} maxLength={140} placeholder="Acheter à Agdal en 2027 : prix, rues et conseils" /></Field>
      <Field label={t('Short introduction')} hint={t('One or two sentences: shown on the list and on Google.')}><textarea className={inputCls} rows={2} value={excerpt} onChange={e => setExcerpt(e.target.value)} maxLength={240} /></Field>
      <div>
        <p className="mb-1 text-sm font-semibold">{t('Cover photo')}</p>
        <div className="flex items-center gap-3">
          {cover ? <img src={photoUrl(cover, true)} alt="" className="h-20 w-32 rounded-xl object-cover" /> : <span className="grid h-20 w-32 place-items-center rounded-xl bg-surface-2 text-muted"><Camera className="h-5 w-5" /></span>}
          <Btn type="button" tone="ghost" disabled={busy} onClick={() => file.current?.click()}><Camera className="h-4 w-4" /> {cover ? t('Change') : t('Add')}</Btn>
          {cover && <Btn type="button" tone="ghost" onClick={() => setCover(null)}><Trash2 className="h-4 w-4" /> {t('Remove')}</Btn>}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pickCover(f); e.target.value = ''; }} />
        </div>
      </div>
      <Field label={t('Text')} hint={t('Start a line with ## for a heading, with - for a list. An empty line starts a new paragraph.')}>
        <textarea className={`${inputCls} font-mono text-sm`} rows={14} value={body} onChange={e => setBody(e.target.value)} maxLength={30000}
          placeholder={'## Les prix à Agdal\nComptez environ 16 000 DH le m² pour un appartement récent.\n\n## Nos conseils\n- Visitez le soir\n- Demandez le montant du syndic'} />
      </Field>
      <label className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="h-5 w-5 accent-brand" />
        <span className="text-sm font-semibold">{published ? <><Eye className="me-1 inline h-4 w-4" />{t('Online on your website')}</> : <><EyeOff className="me-1 inline h-4 w-4" />{t('Draft: only you see it')}</>}</span>
      </label>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn tone="brand" disabled={busy} onClick={save}>{busy ? '…' : t('Save')}</Btn>
        {post && <Btn tone="ghost" onClick={remove}><Trash2 className="h-4 w-4" /> {t('Delete')}</Btn>}
      </div>
    </Card>
  );
}
