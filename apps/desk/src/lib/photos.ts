import { supabase } from './supabase';
import { autoEnhance } from './photoTools';

export const BUCKET = 'property-photos';
export const MAX_PHOTOS = 20;
const BASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');

/** Public address of a stored photo. `base` is {org}/{property}/{photo}; the small version ends in _t. */
export const photoUrl = (base: string, small = false) =>
  `${BASE}/storage/v1/object/public/${BUCKET}/${base}${small ? '_t' : ''}.jpg`;

/** Shrink an image in the browser (long side `max` px) and return it as JPEG. Phone photos are 5 to 10 MB; this makes them 200 to 400 KB. */
export async function shrink(file: File, max: number, quality: number, improve = false): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  if (improve) autoEnhance(ctx, w, h);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality));
}

/** Upload one photo (large + small) and register it. Throws a readable message on failure. */
export async function uploadPhoto(orgId: string, propertyId: string, file: File, improve = false): Promise<void> {
  const id = crypto.randomUUID();
  const base = `${orgId}/${propertyId}/${id}`;
  const [big, small] = await Promise.all([shrink(file, 1600, 0.82, improve), shrink(file, 480, 0.78, improve)]);
  const opts = { contentType: 'image/jpeg', cacheControl: '31536000' };
  const a = await supabase.storage.from(BUCKET).upload(`${base}.jpg`, big, opts);
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.storage.from(BUCKET).upload(`${base}_t.jpg`, small, opts);
  if (b.error) { await supabase.storage.from(BUCKET).remove([`${base}.jpg`]); throw new Error(b.error.message); }
  const r = await supabase.from('property_photos').insert({ id, org_id: orgId, property_id: propertyId });
  if (r.error) {
    await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]);
    throw new Error(r.error.message);
  }
}

export async function deletePhoto(base: string, id: string): Promise<string | null> {
  const r = await supabase.from('property_photos').delete().eq('id', id).select('id');
  if (r.error) return r.error.message;
  if (!r.data?.length) return 'no_permission';
  await supabase.storage.from(BUCKET).remove([`${base}.jpg`, `${base}_t.jpg`]);
  return null;
}
