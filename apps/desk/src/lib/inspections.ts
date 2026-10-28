import { supabase } from './supabase';
import { shrink } from './photos';

export type Condition = 'new' | 'good' | 'fair' | 'poor';
export type InspItem = { label: string; condition: Condition | null; note: string };
export type InspRoom = { name: string; items: InspItem[] };
export type Meters = { water?: string; electricity?: string; gas?: string };
export type Inspection = {
  id: string; org_id: string; lease_id: string; kind: 'entry' | 'exit'; inspected_on: string; rooms: InspRoom[]; meters: Meters;
  keys_note: string | null; general_note: string | null; status: 'draft' | 'signed'; tenant_name: string | null; tenant_signature: string | null;
  agent_name: string | null; agent_signature: string | null; signed_at: string | null;
};
export type InspPhoto = { id: string; org_id: string; inspection_id: string; room: number };

export const BUCKET = 'inspection-photos';
export const CONDITIONS: Condition[] = ['new', 'good', 'fair', 'poor'];
/** The written document is in French (the usual language of an état des lieux in Morocco). */
export const CONDITION_FR: Record<Condition, string> = { new: 'Neuf', good: 'Bon état', fair: 'État moyen', poor: 'Mauvais état' };
export const conditionCls: Record<Condition, string> = { new: 'bg-ok/15 text-ok', good: 'bg-ok/10 text-ok', fair: 'bg-warn/10 text-warn', poor: 'bg-danger/10 text-danger' };

const ITEMS = ['Murs', 'Sol', 'Plafond', 'Portes et fenêtres', 'Électricité et prises', 'Éclairage'];
const WET = ['Robinetterie', 'Sanitaires', 'Carrelage'];
const KITCHEN = ['Plan de travail', 'Évier et robinetterie', 'Placards', 'Électroménager'];
const item = (label: string): InspItem => ({ label, condition: null, note: '' });
export const roomPreset = (name: string): InspRoom => {
  const n = name.toLowerCase();
  const extra = n.includes('cuisine') ? KITCHEN : n.includes('bain') || n.includes('wc') || n.includes('douche') ? WET : [];
  return { name, items: [...ITEMS, ...extra].map(item) };
};
export const ROOM_NAMES = ['Entrée', 'Séjour', 'Cuisine', 'Chambre 1', 'Chambre 2', 'Chambre 3', 'Salle de bain', 'WC', 'Balcon / terrasse', 'Garage', 'Jardin'];
export const defaultRooms = (): InspRoom[] => ['Entrée', 'Séjour', 'Cuisine', 'Chambre 1', 'Salle de bain'].map(roomPreset);

export async function loadInspections(leaseId: string): Promise<Inspection[] | null> {
  const r = await supabase.from('inspections').select('*').eq('lease_id', leaseId);
  return r.error ? null : (r.data ?? []) as Inspection[];
}

/** Start one. An exit report starts from the rooms of the entry report, so the two can be compared item by item. */
export async function createInspection(orgId: string, leaseId: string, kind: 'entry' | 'exit', from?: Inspection): Promise<Inspection> {
  const rooms = from ? from.rooms.map(r => ({ name: r.name, items: r.items.map(i => ({ label: i.label, condition: null, note: '' })) })) : defaultRooms();
  const r = await supabase.from('inspections').insert({ org_id: orgId, lease_id: leaseId, kind, rooms }).select('*').single();
  if (r.error) throw new Error(r.error.message);
  return r.data as Inspection;
}

export async function saveInspection(i: Inspection): Promise<string | null> {
  const r = await supabase.from('inspections').update({
    inspected_on: i.inspected_on, rooms: i.rooms, meters: i.meters, keys_note: i.keys_note?.trim() || null, general_note: i.general_note?.trim() || null,
  }).eq('id', i.id).select('id');
  if (r.error) return r.error.message;
  return r.data?.length ? null : 'You do not have permission to change this.';
}

export async function signInspection(id: string, tenantName: string, tenantSig: string, agentName: string, agentSig: string): Promise<string | null> {
  const { error } = await supabase.rpc('sign_inspection', { p_id: id, p_tenant_name: tenantName, p_tenant_signature: tenantSig, p_agent_name: agentName, p_agent_signature: agentSig });
  return error ? error.message : null;
}

export const photoPath = (p: InspPhoto) => `${p.org_id}/${p.inspection_id}/${p.id}.jpg`;

export async function loadPhotos(inspectionId: string): Promise<{ photos: InspPhoto[]; urls: Record<string, string> }> {
  const r = await supabase.from('inspection_photos').select('id, org_id, inspection_id, room').eq('inspection_id', inspectionId).order('created_at');
  const photos = (r.data ?? []) as InspPhoto[];
  if (!photos.length) return { photos, urls: {} };
  const s = await supabase.storage.from(BUCKET).createSignedUrls(photos.map(photoPath), 3600);
  const urls: Record<string, string> = {};
  (s.data ?? []).forEach((x, i) => { if (x.signedUrl) urls[photos[i].id] = x.signedUrl; });
  return { photos, urls };
}

export async function addPhoto(orgId: string, inspectionId: string, room: number, file: File): Promise<void> {
  const id = crypto.randomUUID();
  const blob = await shrink(file, 1600, 0.8);
  const path = `${orgId}/${inspectionId}/${id}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '0' });
  if (up.error) throw new Error(up.error.message);
  const r = await supabase.from('inspection_photos').insert({ id, org_id: orgId, inspection_id: inspectionId, room });
  if (r.error) { await supabase.storage.from(BUCKET).remove([path]); throw new Error(r.error.message); }
}

export async function removePhoto(p: InspPhoto): Promise<string | null> {
  const r = await supabase.from('inspection_photos').delete().eq('id', p.id).select('id');
  if (r.error) return r.error.message;
  await supabase.storage.from(BUCKET).remove([photoPath(p)]);
  return null;
}
