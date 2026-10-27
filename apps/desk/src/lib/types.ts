import type { DealPurpose, LeadStatus, OrgRole, PropertyStatus, PropertyType } from '@vastgoed/shared';

export type Office = { id: string; name: string; city: string | null; role: OrgRole };

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
  created_at: string;
  updated_at: string;
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

export type LeadRow = {
  id: string;
  org_id: string;
  person_id: string;
  purpose: DealPurpose;
  status: LeadStatus;
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
