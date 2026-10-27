import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Star, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { MAX_PHOTOS, deletePhoto, photoUrl, uploadPhoto } from '../lib/photos';
import { Btn } from '../components/ui';

type Photo = { id: string; org_id: string; property_id: string; is_cover: boolean };
const base = (p: Photo) => `${p.org_id}/${p.property_id}/${p.id}`;

function photoError(message: string): string {
  if (message.includes('maximaal_20_fotos')) return t('A property can have at most {n} photos.', { n: MAX_PHOTOS });
  if (message === 'no_permission') return t('You do not have permission to change this property.');
  return message;
}

/** Photos of one property: upload (several at once), choose the cover, delete. */
export function PhotosSection({ office, property, canWrite, onChanged }: {
  office: Office; property: PropertyRow; canWrite: boolean; onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('property_photos')
      .select('id, org_id, property_id, is_cover')
      .eq('property_id', property.id)
      .order('is_cover', { ascending: false }).order('created_at').order('id');
    if (error) setError(error.message); else setPhotos((data ?? []) as Photo[]);
  }, [property.id]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy) return;
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (list.length === 0) { setError(t('Choose image files (JPEG, PNG or similar).')); return; }
    const room = MAX_PHOTOS - (photos?.length ?? 0);
    if (room <= 0) { setError(t('A property can have at most {n} photos.', { n: MAX_PHOTOS })); return; }
    setBusy(true); setError(null);
    const todo = list.slice(0, room);
    let failed: string | null = null;
    for (let i = 0; i < todo.length; i++) {
      setProgress(t('Uploading {i} of {n}…', { i: i + 1, n: todo.length }));
      try { await uploadPhoto(office.id, property.id, todo[i]); }
      catch (e) { failed = photoError(e instanceof Error ? e.message : String(e)); break; }
    }
    if (!failed && list.length > room) failed = t('Only the first {n} were added: a property can have at most {max} photos.', { n: room, max: MAX_PHOTOS });
    setBusy(false); setProgress(null);
    if (failed) setError(failed);
    if (input.current) input.current.value = '';
    await load(); onChanged();
  };

  const makeCover = async (p: Photo) => {
    if (busy || p.is_cover) return;
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('set_property_cover', { p_photo: p.id });
    setBusy(false);
    if (error) setError(photoError(error.message)); else { await load(); onChanged(); }
  };

  const remove = async (p: Photo) => {
    if (busy || !window.confirm(t('Delete this photo?'))) return;
    setBusy(true); setError(null);
    const err = await deletePhoto(base(p), p.id);
    setBusy(false);
    if (err) setError(photoError(err)); else { await load(); onChanged(); }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" /> {t('Photos')}</h3>
        {photos !== null && <span className="tabular text-xs text-muted">{photos.length} / {MAX_PHOTOS}</span>}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5 sm:p-4">
        {photos === null && !error && <p className="text-sm text-muted">…</p>}
        {photos !== null && photos.length === 0 && (
          <p className="text-sm text-muted">{canWrite ? t('No photos yet. Add some: a property with photos gets far more reactions. The first photo becomes the cover.') : t('No photos yet.')}</p>
        )}

        {photos !== null && photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map(p => (
              <li key={p.id} className="relative overflow-hidden rounded-xl bg-surface-3">
                <img src={photoUrl(base(p), true)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                {p.is_cover && <span className="absolute start-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-bg">{t('Cover')}</span>}
                {canWrite && (
                  <span className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                    <button type="button" disabled={busy || p.is_cover} onClick={() => makeCover(p)} aria-label={t('Make cover')} title={t('Make cover')}
                      className="grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-ink shadow disabled:opacity-40"><Star className="h-4 w-4" /></button>
                    <button type="button" disabled={busy} onClick={() => remove(p)} aria-label={t('Delete photo')} title={t('Delete photo')}
                      className="grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-danger shadow disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={e => onPick(e.target.files)} />
            <Btn tone="ghost" onClick={() => input.current?.click()} disabled={busy || (photos?.length ?? 0) >= MAX_PHOTOS}>
              <Camera className="h-4 w-4" /> {progress ?? t('Add photos')}
            </Btn>
            <p className="text-xs text-muted">{t('Photos are made smaller automatically. They only appear on the public page when that page is online.')}</p>
          </>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
