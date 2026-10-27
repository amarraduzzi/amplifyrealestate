import type { DealPurpose, OrgRole, PropertyStatus, PropertyType } from '@vastgoed/shared';

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
};
