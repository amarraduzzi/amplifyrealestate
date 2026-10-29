import type { DealPurpose, DealStage, LeadStatus, OrgRole, PropertyStatus, PropertyType, TaskStatus, ViewingOutcome, ViewingStatus } from '@vastgoed/shared';

export type Office = { id: string; name: string; slug: string; city: string | null; role: OrgRole };

export type PropertyRow = {
  id: string;
  org_id: string;
  reference: string;
  title: string;
  property_type: PropertyType;
  purpose: DealPurpose;
  status: PropertyStatus;
  price_cents: number | null;
  currency: string;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  furnished: boolean | null;
  description: string | null;
  info_confirmed_at: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  title_status?: 'titre' | 'melkia' | 'en_cours' | null;
  features?: string[];
  floor?: number | null;
  orientation?: string | null;
  syndic_cents?: number | null;
  near_beach?: number | null;
  near_transport?: number | null;
  near_school?: number | null;
  near_mosque?: number | null;
  near_shops?: number | null;
};

export type HistoryRow = {
  id: number;
  changed_by: string | null;
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

export type PersonRow = { id: string; full_name: string; phone: string | null; whatsapp: string | null; email: string | null };

export type LeadSource = 'whatsapp' | 'phone' | 'walk_in' | 'public_page' | 'mubawab' | 'avito' | 'sarouty' | 'facebook' | 'instagram' | 'referral' | 'network' | 'other';

export type LeadRow = {
  id: string;
  org_id: string;
  person_id: string;
  purpose: DealPurpose;
  status: LeadStatus;
  source?: LeadSource | null;
  property_types: PropertyType[];
  city: string | null;
  neighborhoods: string[];
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  min_bedrooms: number | null;
  min_area_m2: number | null;
  furnished: boolean | null;
  notes: string | null;
  last_contact_at: string;
  created_at: string;
  updated_at: string;
};

export type ViewingRow = {
  id: string;
  org_id: string;
  lead_id: string;
  property_id: string;
  scheduled_at: string;
  status: ViewingStatus;
  outcome: ViewingOutcome | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberRow = { user_id: string; email: string; role: OrgRole; created_at: string };

export type TaskRow = {
  id: string;
  org_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  lead_id: string | null;
  property_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealRow = {
  id: string;
  org_id: string;
  lead_id: string;
  property_id: string;
  stage: DealStage;
  price_cents: number;
  commission_pct: number | null;
  commission_cents: number | null;
  notes: string | null;
  lost_reason: string | null;
  stage_changed_at: string;
  signed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeaseStatus = 'active' | 'ended';

export type LeaseRow = {
  id: string;
  org_id: string;
  property_id: string;
  tenant_person_id: string;
  status: LeaseStatus;
  rent_cents: number;
  deposit_cents: number | null;
  start_date: string;
  end_date: string | null;
  payment_day: number;
  ended_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SplitKind = 'co_agent' | 'referrer' | 'other';
export type SplitStatus = 'agreed' | 'paid';

/** A share of the commission of a deal that goes to another agent (or a referrer). */
export type SplitRow = {
  id: string;
  org_id: string;
  deal_id: string;
  person_id: string;
  agency_name: string | null;
  kind: SplitKind;
  share_pct: number;
  status: SplitStatus;
  paid_on: string | null;
  paid_cents: number | null;
  agreement_note: string | null;
  created_at: string;
};
