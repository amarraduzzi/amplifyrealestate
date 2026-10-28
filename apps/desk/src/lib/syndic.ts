import { supabase } from './supabase';

export type LotKind = 'apartment' | 'shop' | 'office' | 'parking' | 'storage' | 'other';
export type Residence = { id: string; org_id: string; name: string; address: string | null; city: string | null; rib: string | null; notes: string | null; archived: boolean };
export type Lot = { id: string; org_id: string; residence_id: string; label: string; kind: LotKind; floor: string | null; tantiemes: number; owner_person_id: string | null };
export type Call = { id: string; org_id: string; residence_id: string; title: string; due_date: string; total_cents: number; basis: 'tantiemes' | 'equal'; status: 'issued' | 'cancelled'; created_at: string };
export type Item = { id: string; org_id: string; call_id: string; lot_id: string; amount_cents: number; paid_cents: number; paid_on: string | null; reminded_on: string | null; note: string | null };
export type Owner = { id: string; full_name: string; phone: string | null; whatsapp: string | null };

export const LOT_KINDS: LotKind[] = ['apartment', 'shop', 'office', 'parking', 'storage', 'other'];

export async function loadResidences(orgId: string): Promise<Residence[] | null> {
  const r = await supabase.from('residences').select('*').eq('org_id', orgId).eq('archived', false).order('name');
  return r.error ? null : (r.data ?? []) as Residence[];
}

/** Everything of one residence: lots with owners, calls and items (calls and items are empty for a viewer). */
export async function loadResidence(id: string): Promise<{ lots: Lot[]; owners: Map<string, Owner>; calls: Call[]; items: Item[] }> {
  const [l, c] = await Promise.all([
    supabase.from('residence_lots').select('*').eq('residence_id', id).order('label'),
    supabase.from('charge_calls').select('*').eq('residence_id', id).order('due_date', { ascending: false }),
  ]);
  const lots = (l.data ?? []) as Lot[];
  const calls = (c.data ?? []) as Call[];
  const [pe, it] = await Promise.all([
    lots.some(x => x.owner_person_id) ? supabase.from('people').select('id, full_name, phone, whatsapp').in('id', lots.map(x => x.owner_person_id).filter(Boolean) as string[]) : Promise.resolve({ data: [] }),
    calls.length ? supabase.from('charge_items').select('*').in('call_id', calls.map(x => x.id)) : Promise.resolve({ data: [] }),
  ]);
  return { lots, calls, items: (it.data ?? []) as Item[], owners: new Map(((pe.data ?? []) as Owner[]).map(o => [o.id, o])) };
}

/** Arrears per residence (past due, not fully paid), for the list. */
export async function loadArrears(orgId: string): Promise<Map<string, number>> {
  const today = new Date().toISOString().slice(0, 10);
  const c = await supabase.from('charge_calls').select('id, residence_id').eq('org_id', orgId).eq('status', 'issued').lt('due_date', today);
  if (c.error || !c.data?.length) return new Map();
  const calls = c.data as { id: string; residence_id: string }[];
  const i = await supabase.from('charge_items').select('call_id, amount_cents, paid_cents').in('call_id', calls.map(x => x.id));
  const res = new Map(calls.map(x => [x.id, x.residence_id]));
  const out = new Map<string, number>();
  for (const x of (i.data ?? []) as { call_id: string; amount_cents: number; paid_cents: number }[]) {
    const r = res.get(x.call_id)!; out.set(r, (out.get(r) ?? 0) + x.amount_cents - x.paid_cents);
  }
  return out;
}

/** The same split as the database does, to show before issuing. */
export function previewSplit(lots: Lot[], totalCents: number, basis: 'tantiemes' | 'equal'): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...lots].sort((a, b) => Number(b.tantiemes) - Number(a.tantiemes) || a.label.localeCompare(b.label));
  const sum = lots.reduce((s, l) => s + Number(l.tantiemes), 0);
  let left = totalCents;
  for (const l of sorted) {
    const v = basis === 'equal' ? Math.floor(totalCents / lots.length) : sum > 0 ? Math.floor(totalCents * Number(l.tantiemes) / sum) : 0;
    out.set(l.id, v); left -= v;
  }
  for (const l of sorted) { if (left <= 0) break; if (basis === 'equal' || Number(l.tantiemes) > 0) { out.set(l.id, out.get(l.id)! + 1); left--; } }
  return out;
}

export function syndicError(m: string): string | null {
  if (m.includes('charge_call_no_lots')) return 'Add the lots of the residence first.';
  if (m.includes('charge_call_no_tantiemes')) return 'Fill in the tantièmes of the lots, or split equally.';
  if (m.includes('charge_call_has_payments')) return 'Payments have already been recorded for this call: it can no longer be cancelled.';
  if (m.includes('residence_lots_residence_id_label_key') || m.includes('duplicate')) return 'A lot with this name already exists in this residence.';
  return null;
}
