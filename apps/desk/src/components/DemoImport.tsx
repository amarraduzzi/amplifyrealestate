import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Office } from '../lib/types';
import { uploadPhoto } from '../lib/photos';
import { uploadAgentPhoto } from '../lib/showcase';
import { uploadSiteImage } from '../lib/site';
import { Btn, Card } from './ui';

/** Eenmalig hulpmiddel: zet de demofoto's uit /demo-import op de juiste plek. Alleen zichtbaar voor de demokantoren. */
export const DEMO_SLUGS = ['demo-immobilier', 'salma-bennani'];

type Manifest = {
  properties: { ref: string; files: string[] }[];
  team: { name: string; file: string }[];
  blog: { slug: string; file: string }[];
};

async function grab(path: string): Promise<File> {
  const r = await fetch(`/demo-import/${path}`);
  if (!r.ok) throw new Error(`${path} introuvable`);
  return new File([await r.blob()], path.replace(/\//g, '_'), { type: 'image/jpeg' });
}

export function DemoImport({ office }: { office: Office }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog(l => [...l, s]);

  const run = async () => {
    setBusy(true); setLog([]);
    try {
      const res = await fetch('/demo-import/manifest.json');
      if (!res.ok) throw new Error('manifest.json introuvable');
      const m = (await res.json()) as Manifest;

      if (office.slug === 'salma-bennani') {
        const { data } = await supabase.from('organizations').select('agent_photo').eq('id', office.id).maybeSingle();
        if (data?.agent_photo) add('Photo de profil : déjà présente');
        else {
          const base = await uploadAgentPhoto(office.id, await grab(m.team[0].file));
          const u = await supabase.from('organizations').update({ agent_photo: base }).eq('id', office.id);
          add(u.error ? `Photo de profil : ${u.error.message}` : 'Photo de profil : ajoutée');
        }
      }

      for (const p of m.properties) {
        const { data: prop } = await supabase.from('properties').select('id').eq('org_id', office.id).eq('reference', p.ref).maybeSingle();
        if (!prop) continue;
        const { count } = await supabase.from('property_photos').select('id', { count: 'exact', head: true }).eq('property_id', prop.id);
        if ((count ?? 0) > 0) { add(`${p.ref} : a déjà des photos, ignoré`); continue; }
        for (let i = 0; i < p.files.length; i++) {
          setLog(l => [...l.filter(x => !x.startsWith(`${p.ref} : envoi`)), `${p.ref} : envoi ${i + 1}/${p.files.length}`]);
          await uploadPhoto(office.id, prop.id, await grab(`${p.ref}/${p.files[i]}`));
        }
        setLog(l => [...l.filter(x => !x.startsWith(`${p.ref} : envoi`)), `${p.ref} : ${p.files.length} photos ajoutées`]);
      }

      if (office.slug === 'demo-immobilier') {
        const { data: team } = await supabase.from('site_team').select('id, name, photo').eq('org_id', office.id);
        for (const x of m.team) {
          const row = (team ?? []).find(r => r.name === x.name);
          if (!row) continue;
          if (row.photo) { add(`${x.name} : photo déjà présente`); continue; }
          const base = await uploadSiteImage(office.id, await grab(x.file), 700);
          const u = await supabase.from('site_team').update({ photo: base }).eq('id', row.id);
          add(u.error ? `${x.name} : ${u.error.message}` : `${x.name} : photo ajoutée`);
        }
        for (const b of m.blog) {
          const { data: post } = await supabase.from('site_posts').select('id, cover').eq('org_id', office.id).eq('slug', b.slug).maybeSingle();
          if (!post) continue;
          if (post.cover) { add(`Article ${b.slug} : couverture déjà présente`); continue; }
          const base = await uploadSiteImage(office.id, await grab(b.file));
          const u = await supabase.from('site_posts').update({ cover: base }).eq('id', post.id);
          add(u.error ? `Article ${b.slug} : ${u.error.message}` : `Article ${b.slug} : couverture ajoutée`);
        }
      }
      add('Terminé.');
    } catch (e) {
      add(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Photos de démo</p>
          <p className="text-sm text-muted">Place toutes les photos de démo au bon endroit. Les biens qui ont déjà des photos sont ignorés.</p>
        </div>
        <Btn type="button" onClick={run} disabled={busy}><ImagePlus className="h-4 w-4" /> {busy ? 'Envoi en cours…' : 'Importer les photos'}</Btn>
      </div>
      {log.length > 0 && <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto text-sm text-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </Card>
  );
}
