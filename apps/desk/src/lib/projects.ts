import { supabase } from './supabase';
import { t } from './i18n';

export type ProjectStatus = 'planning' | 'selling' | 'construction' | 'delivered';
export type UnitKind = 'apartment' | 'villa' | 'duplex' | 'studio' | 'shop' | 'office' | 'parking' | 'storage' | 'plot' | 'other';
export type UnitStatus = 'available' | 'option' | 'reserved' | 'sold' | 'blocked';

export type Project = { id: string; org_id: string; name: string; city: string | null; address: string | null; description: string | null; status: ProjectStatus; delivery_date: string | null; archived: boolean; slug?: string | null; published?: boolean; show_prices?: boolean } & Milestones;
export type Tranche = { id: string; org_id: string; project_id: string; name: string; position: number; delivery_date: string | null } & Partial<Milestones>;
export type Unit = {
  id: string; org_id: string; project_id: string; tranche_id: string | null; reference: string; kind: UnitKind; building: string | null; floor: number | null;
  bedrooms: number | null; area_m2: number | null; terrace_m2: number | null; price_cents: number | null; status: UnitStatus; notes: string | null; status_changed_at: string;
};
export type Milestones = { foundations_on: string | null; structure_on: string | null; finishing_on: string | null; keys_on: string | null };
export type MilestoneKey = 'contract' | 'foundations' | 'structure' | 'finishing' | 'keys' | 'deed' | 'date';
export type SaleKind = 'vefa' | 'reservation';
export type SaleStatus = 'reserved' | 'signed' | 'delivered' | 'cancelled';
export type Sale = { id: string; org_id: string; project_id: string; unit_id: string; buyer_person_id: string; kind: SaleKind; status: SaleStatus; price_cents: number;
  reserved_on: string; signed_on: string | null; delivered_on: string | null; cancelled_on: string | null; notes: string | null };
export type Installment = { id: string; org_id: string; sale_id: string; position: number; label: string; milestone: MilestoneKey; pct: number; amount_cents: number;
  due_date: string | null; paid_cents: number; paid_on: string | null; reminded_on: string | null };
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

export const BUILD_STEPS = ['foundations', 'structure', 'finishing', 'keys'] as const;
export type BuildStep = typeof BUILD_STEPS[number];
export const milestoneLabel = (m: MilestoneKey) => t(({
  contract: 'At signing', foundations: 'Foundations finished', structure: 'Structural work finished', finishing: 'Finishing works and housing permit',
  keys: 'Handing over the keys', deed: 'Final deed at the notary', date: 'On a date',
} as const)[m]);
export const saleStatusLabel = (s: SaleStatus) => t(({ reserved: 'Reserved', signed: 'Contract signed', delivered: 'Delivered', cancelled: 'Cancelled' } as const)[s]);

export type Step = { label: string; milestone: MilestoneKey; pct: string; due_date: string };
/** Loi 107-12: at most 5% at the preliminary contract, 75% over foundations, structural work and finishing, 20% at the keys. */
export const VEFA_TEMPLATE = (): Step[] => [
  { label: 'Contrat préliminaire', milestone: 'contract', pct: '5', due_date: '' },
  { label: 'Achèvement des fondations', milestone: 'foundations', pct: '25', due_date: '' },
  { label: 'Achèvement du gros œuvre', milestone: 'structure', pct: '30', due_date: '' },
  { label: 'Achèvement des finitions', milestone: 'finishing', pct: '20', due_date: '' },
  { label: 'Remise des clés', milestone: 'keys', pct: '20', due_date: '' },
];
export const RESERVATION_TEMPLATE = (): Step[] => [
  { label: 'Acompte de réservation', milestone: 'contract', pct: '10', due_date: '' },
  { label: 'Solde à l’acte définitif', milestone: 'deed', pct: '90', due_date: '' },
];

/** The date from which an installment can be asked: its own date, the date of signing, or the date its building step was reached. */
export function dueOf(i: Installment, sale: Sale, project: Milestones, tranche?: Partial<Milestones>): string | null {
  if (i.due_date) return i.due_date;
  if (i.milestone === 'contract') return sale.reserved_on;
  if (i.milestone === 'deed' || i.milestone === 'date') return null;
  const k = `${i.milestone}_on` as keyof Milestones;
  return tranche?.[k] ?? project[k] ?? null;
}

export async function loadSales(projectId: string): Promise<{ sales: Sale[]; installments: Installment[] } | null> {
  const s = await supabase.from('dev_sales').select('*').eq('project_id', projectId).order('reserved_on', { ascending: false });
  if (s.error) return null;
  const sales = s.data as Sale[];
  if (!sales.length) return { sales, installments: [] };
  const i = await supabase.from('dev_installments').select('*').in('sale_id', sales.map(x => x.id)).order('position');
  return { sales, installments: ((i.data ?? []) as Installment[]).map(x => ({ ...x, pct: Number(x.pct) })) };
}

export function saleError(m: string): string | null {
  if (m.includes('schedule_not_100')) return 'The installments must add up to exactly 100%.';
  if (m.includes('schedule_not_vefa')) return 'Loi 107-12: at most 5% at the preliminary contract and at least 20% at the keys.';
  if (m.includes('schedule_invalid')) return 'Every installment needs a percentage, and a date when it is on a date.';
  if (m.includes('unit_not_available')) return 'This unit is already reserved or sold.';
  if (m.includes('unit_has_sale')) return 'This unit has a running sale. Cancel the sale to make it available again.';
  if (m.includes('sale_buyer_missing')) return 'Enter the buyer.';
  return null;
}
