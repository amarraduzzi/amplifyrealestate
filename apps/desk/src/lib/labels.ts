import type { DealPurpose, DealStage, LeadStatus, MandateBasis, MandateStatus, OrgRole, PartyRole, PropertyStatus, PropertyType, TaskStatus, ViewingOutcome, ViewingStatus } from '@vastgoed/shared';
import { t } from './i18n';

export const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
export const TYPES: PropertyType[] = ['apartment', 'villa', 'riad', 'house', 'land', 'shop', 'office', 'building', 'other'];
export const STATUSES: PropertyStatus[] = ['available', 'reserved', 'rented', 'sold', 'draft', 'withdrawn'];

export const purposeLabel = (p: DealPurpose) =>
  t(({ sale: 'For sale', rent_long: 'Long-term rent', rent_short: 'Short-term rent' } as const)[p]);

export const priceSuffix = (p: DealPurpose) =>
  p === 'rent_long' ? t('/ month') : p === 'rent_short' ? t('/ night') : '';

export const typeLabel = (x: PropertyType) =>
  t(({
    apartment: 'Apartment', villa: 'Villa', riad: 'Riad', house: 'House', land: 'Land',
    shop: 'Shop', office: 'Office', building: 'Building', other: 'Other',
  } as const)[x]);

export const statusLabel = (s: PropertyStatus) =>
  t(({
    draft: 'Draft', available: 'Available', reserved: 'Reserved',
    rented: 'Rented', sold: 'Sold', withdrawn: 'Withdrawn',
  } as const)[s]);

export const statusCls: Record<PropertyStatus, string> = {
  available: 'bg-ok/10 text-ok',
  reserved: 'bg-warn/10 text-warn',
  rented: 'bg-qr/10 text-qr',
  sold: 'bg-qr/10 text-qr',
  draft: 'bg-surface-3 text-muted',
  withdrawn: 'bg-danger/10 text-danger',
};

/** Whole days since an ISO date (0 = today). */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d < 0 ? 0 : d;
}

export const PARTY_ROLES: PartyRole[] = ['owner', 'representative', 'tenant', 'buyer', 'contact'];
export const BASES: MandateBasis[] = ['written', 'verbal', 'owner_self', 'unverified'];

export const partyRoleLabel = (r: PartyRole) =>
  t(({ owner: 'Owner', representative: 'Representative', tenant: 'Tenant', buyer: 'Buyer', contact: 'Contact' } as const)[r]);

export const basisLabel = (b: MandateBasis) =>
  t(({ written: 'Written mandate', verbal: 'Verbal agreement', owner_self: 'Owner lists it themselves', unverified: 'Not verified' } as const)[b]);

export const mandateStatusLabel = (s: MandateStatus) =>
  t(({ active: 'Active', expired: 'Expired', revoked: 'Revoked' } as const)[s]);

export const mandateCls: Record<MandateStatus, string> = {
  active: 'bg-ok/10 text-ok',
  expired: 'bg-warn/10 text-warn',
  revoked: 'bg-danger/10 text-danger',
};

export const LEAD_STATUSES: LeadStatus[] = ['new', 'active', 'viewing', 'won', 'lost'];
/** Leads that are still looking: only these are matched with properties. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = ['new', 'active', 'viewing'];

export const leadStatusLabel = (s: LeadStatus) =>
  t(({ new: 'New', active: 'Active', viewing: 'Viewing', won: 'Won', lost: 'Lost' } as const)[s]);

export const leadStatusCls: Record<LeadStatus, string> = {
  new: 'bg-qr/10 text-qr',
  active: 'bg-ok/10 text-ok',
  viewing: 'bg-warn/10 text-warn',
  won: 'bg-ink text-bg',
  lost: 'bg-surface-3 text-muted',
};

export const VIEWING_STATUSES: ViewingStatus[] = ['scheduled', 'done', 'no_show', 'cancelled'];

export const viewingStatusLabel = (s: ViewingStatus) =>
  t(({ scheduled: 'Scheduled', done: 'Done', no_show: 'No-show', cancelled: 'Cancelled' } as const)[s]);

export const viewingStatusCls: Record<ViewingStatus, string> = {
  scheduled: 'bg-qr/10 text-qr',
  done: 'bg-ok/10 text-ok',
  no_show: 'bg-warn/10 text-warn',
  cancelled: 'bg-surface-3 text-muted',
};

export const VIEWING_OUTCOMES: ViewingOutcome[] = ['interested', 'offer_made', 'not_interested'];

export const outcomeLabel = (o: ViewingOutcome) =>
  t(({ interested: 'Interested', not_interested: 'Not interested', offer_made: 'Made an offer' } as const)[o]);

export const outcomeCls: Record<ViewingOutcome, string> = {
  interested: 'bg-ok/10 text-ok',
  offer_made: 'bg-ink text-bg',
  not_interested: 'bg-surface-3 text-muted',
};

export const ROLES: OrgRole[] = ['owner', 'manager', 'agent', 'viewer'];

export const roleLabel = (r: OrgRole) =>
  t(({ owner: 'Owner', manager: 'Manager', agent: 'Agent', viewer: 'Viewer' } as const)[r]);

export const roleHint = (r: OrgRole) =>
  t(({
    owner: 'Everything, including managing the team',
    manager: 'Edit everything and manage the team',
    agent: 'Add and edit properties, leads and viewings',
    viewer: 'View only',
  } as const)[r]);

export const TASK_STATUSES: TaskStatus[] = ['open', 'done', 'cancelled'];

export const taskStatusLabel = (s: TaskStatus) =>
  t(({ open: 'Open', done: 'Done', cancelled: 'Cancelled' } as const)[s]);

export const DEAL_STAGES: DealStage[] = ['offer', 'accepted', 'signed', 'paid', 'lost'];

export const dealStageLabel = (s: DealStage) =>
  t(({ offer: 'Offer', accepted: 'Accepted', signed: 'Signed', paid: 'Paid', lost: 'Lost' } as const)[s]);

export const dealStageCls: Record<DealStage, string> = {
  offer: 'bg-qr/10 text-qr',
  accepted: 'bg-warn/10 text-warn',
  signed: 'bg-ok/10 text-ok',
  paid: 'bg-ink text-bg',
  lost: 'bg-surface-3 text-muted',
};
