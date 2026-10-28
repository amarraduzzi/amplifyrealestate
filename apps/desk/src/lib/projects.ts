import { supabase } from './supabase';
import { t } from './i18n';

export type ProjectStatus = 'planning' | 'selling' | 'construction' | 'delivered';
export type UnitKind = 'apartment' | 'villa' | 'duplex' | 'studio' | 'shop' | 'office' | 'parking' | 'storage' | 'plot' | 'other';
export type UnitStatus = 'available' | 'option' | 'reserved' | 'sold' | 'blocked';

export type Project = { id: string; org_id: string; name: string; city: string | null; address: string | null; description: string | null; status: ProjectStatus; delivery_date: string | null; archived: boolean };
export type Tranche = { id: string; org_id: string; project_id: string; name: string; position: number; delivery_date: string | null };
export type Unit = {
  id: string; org_id: string; project_id: string; tranche_id: string | null; reference: string; kind: UnitKind; building: string | null; floor: number | null;
  bedrooms: number | null; area_m2: number | null; terrace_m2: number | null; price_cents: number | null; status: UnitStatus; notes: string | null; status_changed_at: string;
};
export type Buyer = { unit_id: string; buyer_person_id: string; buyer_name: string; buyer_phone: string | null };

export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'selling', 'construction', 'delivered'];
export const UNIT_KINDS: UnitKind[] = ['apartment', 'villa', 'duplex', 'studio', 'shop', 'office', 'parking', 'storage', 'plot', 'other'];
export const UNIT_STATUSES: UnitStatus[] = ['available', 'option', 'reserved', 'sold', 'blocked'];

export const projectStatusLabel = (s: ProjectStatus) => t(({ planning: 'In preparation', selling: 'On sale', construction: 'Under construction', delivered: 'Delivered' } as const)[s]);
export const unitKindLabel = (k: UnitKind) => t(({ apartment: 'Apartment', villa: 'Villa', duplex: 'Duplex', studio: 'Studio', shop: 'Shop', office: 'Office space', parking: 'Parking', storage: 'Storage', plot: 'Plot', other: 'Other' } as const)[k]);
export const unitStatusLabel = (s: UnitStatus) => t(({ available: 'Available', option: 'Option', reserved: 'Reserved', sold: 'Sold', blocked: 'Blocked' } as const)[s]);
/** Colour per status, the same in the grid, the list and the legend. */
export const UNIT_CLS: Record<UnitStatus, string> = {
  available: 'bg-ok/15 text-ok ring-ok/30',
  option: 'bg-warn/15 text-warn ring-warn/30',
  reserved: 'bg-sky-500/15 text-sky-600 ring-sky-500/30',
  sold: 'bg-ink text-bg ring-ink',
  blocked: 'bg-surface-2 text-muted ring-line/15',
};
export const floorLabel = (f: number | null) => (f === null ? '—' : f === 0 ? t('Ground floor') : f < 0 ? t('Basement {n}', { n: -f }) : t('Floor {n}', { n: f }));

export async function loadProjects(orgId: string): Promise<Project[] | null> {
  const r = await supabase.from('dev_projects').select('*').eq('org_id', orgId).eq('archived', false).order('name');
  return r.error ? null : (r.data as Project[]);
}

export async function loadProject(id: string, withBuyers: boolean): Promise<{ tranches: Tranche[]; units: Unit[]; buyers: Map<string, Buyer> }> {
  const [tr, un, by] = await Promise.all([
    supabase.from('dev_tranches').select('*').eq('project_id', id).order('position').order('name'),
    supabase.from('dev_units').select('id, org_id, project_id, tranche_id, reference, kind, building, floor, bedrooms, area_m2, terrace_m2, price_cents, status, notes, status_changed_at').eq('project_id', id).order('building').order('floor').order('reference'),
    withBuyers ? supabase.rpc('dev_unit_buyers', { p_project: id }) : Promise.resolve({ data: [] as Buyer[] }),
  ]);
  const units = ((un.data ?? []) as Unit[]).map(u => ({ ...u, area_m2: u.area_m2 === null ? null : Number(u.area_m2), terrace_m2: u.terrace_m2 === null ? null : Number(u.terrace_m2) }));
  return { tranches: (tr.data ?? []) as Tranche[], units, buyers: new Map(((by.data ?? []) as Buyer[]).map(b => [b.unit_id, b])) };
}

/** Example references for the series form, the same way the database makes them. */
export function seriesRef(building: string, floor: number, n: number): string {
  const b = building.trim();
  const num = floor < 0 ? `S${-floor}${String(n).padStart(2, '0')}` : `${floor}${String(n).padStart(2, '0')}`;
  return (b ? `${b}-` : '') + (floor === 0 ? `0${String(n).padStart(2, '0')}` : num);
}

export function projectError(m: string): string | null {
  if (m.includes('unit_reference_taken') || m.includes('dev_units_project_id_reference_key')) return 'Some of these references already exist in this project.';
  if (m.includes('units_too_many')) return 'At most 500 units at once.';
  if (m.includes('units_invalid')) return 'Check the floors and the number of units per floor.';
  if (m.includes('unit_sold_locked')) return 'This unit is sold. Only the owner or a manager of the office can change it.';
  if (m.includes('unit_tranche_other_project')) return 'This tranche belongs to another project.';
  if (m.includes('dev_tranches_project_id_name_key')) return 'A tranche with this name already exists.';
  return null;
}
