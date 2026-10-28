import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, Globe, ImagePlus, MessageCircle, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { LeadSource, Office } from '../lib/types';
import type { Project } from '../lib/projects';
import { BUCKET, photoUrl, shrink } from '../lib/photos';
import { PUBLIC_SITE } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { leadStatusLabel, sourceLabel } from '../lib/labels';
import { ContactLinks } from '../components/ContactLinks';
import { Btn, Field, inputCls } from '../components/ui';
import type { LeadStatus } from '@vastgoed/shared';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(d));
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const err = (m: string) => {
  if (m.includes('dev_projects_slug_idx')) return t('Another project already uses this web address.');
  if (m.includes('photo_limit')) return t('At most 20 photos per project.');
  if (m.includes('dev_projects_slug_check')) return t('Use only letters, numbers and hyphens, at least 3.');
  return planError(m);
};

type Member = { user_id: string; email: string; role: string };
type Photo = { id: string; org_id: string; project_id: string; position: number };
type LeadRow = { id: string; person_id: string; status: LeadStatus; source: LeadSource | null; created_at: string; notes: string | null };
type Person = { id: string; full_name: string; phone: string | null; whatsapp: string | null; email: string | null };
const SOURCES: LeadSource[] = ['walk_in', 'phone', 'whatsapp', 'facebook', 'instagram', 'mubawab', 'avito', 'referral', 'other'];

export function ProjectMarketing({ office, project, onChanged }: { office: Office; project: Project & { slug?: string | null; published?: boolean; show_prices?: boolean }; onChanged: () => void }) {
  const canWrite = office.role !== 'viewer';
  const [slug, setSlug] = useState(project.slug ?? slugify(project.name));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [team, setTeam] = useState<Set<string>>(new Set());
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lf, setLf] = useState({ name: '', phone: '', source: 'walk_in' as LeadSource, note: '' });
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [ph, tm, mb, ld] = await Promise.all([
      supabase.from('dev_project_photos').select('id, org_id, project_id, position').eq('project_id', project.id).order('position').order('created_at'),
      supabase.from('dev_project_team').select('user_id').eq('project_id', project.id),
      supabase.rpc('list_members', { p_org: office.id }),
      supabase.from('leads').select('id, person_id, status, source, created_at, notes').eq('project_id', project.id).order('created_at', { ascending: false }),
    ]);
    setPhotos((ph.data ?? []) as Photo[]);
    setTeam(new Set(((tm.data ?? []) as { user_id: string }[]).map(x => x.user_id)));
    setMembers(((mb.data ?? []) as Member[]).filter(m => m.role !== 'viewer'));
    const l = (ld.data ?? []) as LeadRow[];
    setLeads(l);
    if (l.length) {
      const p = await supabase.from('people').select('id, full_name, phone, whatsapp, email').in('id', [...new Set(l.map(x => x.person_id))]);
      setPeople(new Map(((p.data ?? []) as Person[]).map(x => [x.id, x])));
    }
  }, [project.id, office.id]);
  useEffect(() => { load(); }, [load]);

  const url = project.slug && PUBLIC_SITE ? `${PUBLIC_SITE}/${office.slug}/projet/${project.slug}` : '';
  const save = async (patch: Record<string, unknown>) => {
    const r = await supabase.from('dev_projects').update(patch).eq('id', project.id).select('id');
    if (r.error) { setError(err(r.error.message)); return false; }
    setError(null); onChanged(); return true;
  };
  const publish = async (on: boolean) => {
    const s = slugify(slug);
    if (on && s.length < 3) { setError(t('Use only letters, numbers and hyphens, at least 3.')); return; }
    if (on && photos.length === 0 && !window.confirm(t('The project has no photos yet. Publish anyway?'))) return;
    await save(on ? { slug: s, published: true } : { published: false });
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      for (const f of [...files].slice(0, 20 - photos.length)) {
        const id = crypto.randomUUID();
        const base = `${office.id}/${project.id}/${id}`;
        const [big, small] = await Promise.all([shrink(f, 1600, 0.82), shrink(f, 480, 0.78)]);
        const opts = { contentType: 'image/jpeg', cacheControl: '31536000' };
        const a = await supabase.storage.from(BUCKET).upload(`${base}.jpg`, big, opts);
        if (a.error) throw new Error(a.error.message);
        const b = await supabase.storage.from(BUCKET).upload(`${base}_t.jpg`, small, opts);
        if (b.error) throw new Error(b.error.message);
        const r = await supabase.from('dev_project_photos').insert({ id, org_id: office.id, project_id: project.id, position: photos.length + 1 });
        if (r.error) { await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]); throw new Error(r.error.message); }
      }
    } catch (e) { setError(err(e instanceof Error ? e.message : String(e))); }
    setBusy(false); if (file.current) file.current.value = ''; load();
  };
  const removePhoto = async (p: Photo) => {
    const base = `${p.org_id}/${p.project_id}/${p.id}`;
    await supabase.from('dev_project_photos').delete().eq('id', p.id);
    await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]);
    load();
  };
  const makeCover = async (p: Photo) => {
    await Promise.all(photos.map((x, i) => supabase.from('dev_project_photos').update({ position: x.id === p.id ? 0 : i + 1 }).eq('id', x.id)));
    load();
  };
  const toggleTeam = async (m: Member) => {
    const r = team.has(m.user_id)
      ? await supabase.from('dev_project_team').delete().eq('project_id', project.id).eq('user_id', m.user_id)
      : await supabase.from('dev_project_team').insert({ project_id: project.id, org_id: office.id, user_id: m.user_id });
    if (r.error) setError(err(r.error.message)); else load();
  };
  const addLead = async (e: FormEvent) => {
    e.preventDefault();
    if (lf.name.trim().length < 2) { setError(t('Enter the name.')); return; }
    const p = await supabase.from('people').insert({ org_id: office.id, full_name: lf.name.trim(), phone: lf.phone.trim() || null, whatsapp: lf.phone.trim() || null, notes: `Prospect ${project.name}` }).select('id').single();
    if (p.error) { setError(err(p.error.message)); return; }
    const r = await supabase.from('leads').insert({ org_id: office.id, person_id: (p.data as { id: string }).id, purpose: 'sale', status: 'new', source: lf.source, city: project.city, project_id: project.id, notes: lf.note.trim() || null });
    if (r.error) { setError(err(r.error.message)); return; }
    setLf({ name: '', phone: '', source: lf.source, note: '' }); setError(null); load();
  };
  const setStatus = async (l: LeadRow, s: LeadStatus) => { const r = await supabase.from('leads').update({ status: s }).eq('id', l.id).select('id'); if (r.error) setError(err(r.error.message)); else load(); };
  const byStatus = (s: LeadStatus) => leads.filter(l => l.status === s).length;

  return (
    <div className="mt-4 space-y-5">
      {/* the public page */}
      <section className="rounded-2xl bg-surface-2 p-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-brand" /> {t('Project page')}
          <span className={`ms-auto rounded-full px-2 py-0.5 text-xs font-bold ${project.published ? 'bg-ok/10 text-ok' : 'bg-surface text-muted'}`}>{project.published ? t('Online') : t('Not online')}</span></h3>
        <p className="mt-0.5 text-xs text-muted">{t('A page with photos, the available units and a contact form. Requests arrive here as leads, with a call-back task for the sales team.')}</p>
        {canWrite && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t('Web address')} hint={PUBLIC_SITE ? `${PUBLIC_SITE.replace(/^https?:\/\//, '')}/${office.slug}/projet/${slugify(slug) || '…'}` : undefined}>
              <input className={inputCls} dir="ltr" value={slug} onChange={e => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug))} maxLength={60} disabled={project.published} />
            </Field>
            <div className="flex items-end gap-2">{project.published ? <Btn onClick={() => publish(false)}>{t('Take offline')}</Btn> : <Btn tone="brand" onClick={() => publish(true)}>{t('Put online')}</Btn>}</div>
          </div>
        )}
        {canWrite && (
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={project.show_prices ?? true} onChange={e => save({ show_prices: e.target.checked })} /> {t('Show prices on the page')}</label>
        )}
        {project.published && url && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn tone="brand" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${project.name}${project.city ? `, ${project.city}` : ''}\n${url}?lang=fr`)}`, '_blank', 'noopener')}><MessageCircle className="h-4 w-4" /> {t('Share on WhatsApp')}</Btn>
            <Btn tone="ghost" onClick={async () => { try { await navigator.clipboard.writeText(`${url}?lang=fr`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
            <Btn tone="ghost" onClick={() => window.open(`${url}?lang=fr`, '_blank', 'noopener')}><ExternalLink className="h-4 w-4" /> {t('Open')}</Btn>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-surface-3">
              <img src={photoUrl(`${p.org_id}/${p.project_id}/${p.id}`, true)} alt="" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('Cover')}</span>}
              {canWrite && <span className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                {i > 0 ? <button type="button" onClick={() => makeCover(p)} className="rounded-lg bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink">{t('Cover')}</button> : <span />}
                <button type="button" onClick={() => removePhoto(p)} aria-label={t('Remove')} className="grid h-6 w-6 place-items-center rounded-lg bg-white/90 text-danger"><Trash2 className="h-3.5 w-3.5" /></button></span>}
            </div>
          ))}
          {canWrite && photos.length < 20 && (
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line/20 text-muted hover:text-ink">
              <span className="flex flex-col items-center gap-1 text-xs font-semibold"><ImagePlus className="h-5 w-5" />{busy ? '…' : t('Add photos')}</span>
            </button>
          )}
          <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
        </div>
      </section>

      {/* the sales team */}
      <section className="rounded-2xl bg-surface-2 p-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-brand" /> {t('Sales team')}</h3>
        <p className="mt-0.5 text-xs text-muted">{t('Requests from the project page go to the team member with the fewest open tasks.')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map(m => (
            <button key={m.user_id} type="button" disabled={!canWrite} aria-pressed={team.has(m.user_id)} onClick={() => toggleTeam(m)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${team.has(m.user_id) ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{team.has(m.user_id) && <Check className="me-1 inline h-3 w-3" />}{m.email}</button>
          ))}
        </div>
      </section>

      {/* leads of the project */}
      <section>
        <h3 className="text-sm font-semibold">{t('Leads for this project')} <span className="font-normal text-muted">· {t('{a} new, {b} active, {c} won', { a: byStatus('new'), b: byStatus('active') + byStatus('viewing'), c: byStatus('won') })}</span></h3>
        {canWrite && (
          <form onSubmit={addLead} className="mt-2 grid gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input className={inputCls} value={lf.name} onChange={e => setLf({ ...lf, name: e.target.value })} maxLength={200} placeholder={t('Name')} />
            <input className={inputCls} dir="ltr" value={lf.phone} onChange={e => setLf({ ...lf, phone: e.target.value })} maxLength={40} placeholder={t('Phone or WhatsApp')} />
            <select className={inputCls} value={lf.source} onChange={e => setLf({ ...lf, source: e.target.value as LeadSource })}>{SOURCES.map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}</select>
            <Btn tone="brand" type="submit"><Plus className="h-4 w-4" /> {t('Add')}</Btn>
            <input className={`${inputCls} sm:col-span-4`} value={lf.note} onChange={e => setLf({ ...lf, note: e.target.value })} maxLength={2000} placeholder={t('What are they looking for? (optional)')} />
          </form>
        )}
        {leads.length === 0 && <p className="mt-4 text-center text-sm text-muted">{t('No leads for this project yet.')}</p>}
        <ul className="mt-2 space-y-2">
          {leads.map(l => { const p = people.get(l.person_id); return (
            <li key={l.id} className="rounded-2xl bg-surface px-3.5 py-3 ring-1 ring-line/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm"><span className="font-semibold">{p?.full_name ?? '—'}</span> <span className="text-xs text-muted">· {day(l.created_at)}{l.source ? ` · ${sourceLabel(l.source)}` : ''}</span></span>
                {canWrite ? (
                  <select value={l.status} onChange={e => setStatus(l, e.target.value as LeadStatus)} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">
                    {(['new', 'active', 'viewing', 'won', 'lost'] as const).map(s => <option key={s} value={s}>{leadStatusLabel(s)}</option>)}
                  </select>
                ) : <span className="text-xs font-semibold">{leadStatusLabel(l.status)}</span>}
              </div>
              {p && <div className="mt-1"><ContactLinks c={p} /></div>}
              {l.notes && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted">{l.notes}</p>}
            </li>); })}
        </ul>
      </section>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
