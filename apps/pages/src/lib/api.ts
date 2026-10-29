import type { DealPurpose, PropertyStatus, PropertyType } from '@vastgoed/shared';

// The public pages read through two database functions (public_office_page, public_property_page).
// Visitors have no access to any table. Only the public anon key is used here.

export type PublicAgent = { name: string; role: string | null; photo: string | null; langs: string[] };
export type PublicOffice = { name: string; slug: string; city: string | null; whatsapp: string | null; phone: string | null; email: string | null; domain?: string | null; agent?: PublicAgent | null; edition?: 'agence' | 'agent'; links?: Partial<Record<'avito' | 'mubawab' | 'facebook' | 'instagram' | 'tiktok', string>>; style?: { theme?: 'moderne' | 'riad' | 'noir' | null; color?: string | null; logo?: string | null } };

export type PublicCard = {
  reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; status: PropertyStatus;
  price_cents: number | null; currency: string; city: string | null; neighborhood: string | null;
  bedrooms: number | null; bathrooms: number | null; area_m2: number | null;
  cover?: string | null;
  /** When the property went online, and its earlier price if it dropped in the last 30 days. */
  published_at?: string | null; old_price_cents?: number | null;
  /** Up to 5 photos, cover first, to swipe through on the card. */
  photos?: string[];
};
export type NearKey = 'beach' | 'transport' | 'school' | 'mosque' | 'shops';
export type PublicProperty = PublicCard & {
  furnished: boolean | null; description: string | null; info_confirmed_at: string | null; published_at: string | null; photos?: string[];
  title_status?: 'titre' | 'melkia' | 'en_cours' | null; features?: string[]; floor?: number | null; orientation?: string | null;
  syndic_cents?: number | null; near?: Partial<Record<NearKey, number>>;
};

export type SiteMember = { name: string; role: string | null; photo: string | null; whatsapp: string | null; langs: string[] };
export type SiteReview = { author: string; place: string | null; body: string; rating: number };
export type SiteBlock = 'hero' | 'listings' | 'projects' | 'about' | 'team' | 'reviews' | 'areas' | 'map' | 'blog' | 'estimate' | 'contact';
export type PostCard = { slug: string; title: string; excerpt: string | null; cover: string | null; published_at: string };
export type OfficeSite = {
  tagline: string | null; about: string | null; services: string | null; areas: string | null; done: number;
  hero?: string | null; hero_title?: string | null; hero_sub?: string | null; blocks?: SiteBlock[]; team?: SiteMember[]; reviews?: SiteReview[];
  points?: Record<string, [number, number]>; posts?: PostCard[];
};
export type OfficePage = { office: PublicOffice; site?: OfficeSite; listings: PublicCard[] };
export type PropertyPage = { office: PublicOffice; property: PublicProperty; similar?: PublicCard[] };

const BASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** Public address of a photo. `base` comes from the database; the small version ends in _t. */
export const photoUrl = (base: string, small = false) => `${BASE}/storage/v1/object/public/property-photos/${base}${small ? '_t' : ''}.jpg`;

export const apiConfigured = Boolean(BASE && KEY);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function rpc<T>(fn: string, body: Record<string, string>): Promise<T | null> {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T | null;
}

/** null = this page does not exist (or is not online). An error is thrown when the server cannot be reached. */
export async function loadOffice(slug: string): Promise<OfficePage | null> {
  if (!SLUG.test(slug)) return null;
  return rpc<OfficePage>('public_office_page', { p_slug: slug });
}

export async function loadProperty(slug: string, reference: string): Promise<PropertyPage | null> {
  if (!SLUG.test(slug) || reference.length > 40) return null;
  return rpc<PropertyPage>('public_property_page', { p_slug: slug, p_reference: reference });
}

/** Count a visit or a click (no personal data). Never blocks or breaks the page. Visits count once per session. */
export function logEvent(slug: string, reference: string | null, kind: 'view' | 'whatsapp' | 'call'): void {
  if (!apiConfigured || !SLUG.test(slug)) return;
  const key = `ev:${kind}:${slug}:${reference ?? ''}`;
  if (kind === 'view') {
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  }
  try {
    fetch(`${BASE}/rest/v1/rpc/log_page_event`, {
      method: 'POST', keepalive: true,
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_reference: reference ?? '', p_kind: kind }),
    }).catch(() => { /* the page works without it */ });
  } catch { /* ignore */ }
}

export type InquiryResult = 'ok' | 'invalid' | 'busy' | 'error';

/** "Tell me about new properties": a lead with search criteria and the alert flag; the office sends matches on WhatsApp. */
export async function submitAlert(o: {
  slug: string; name: string; phone: string; purpose: string; type: string | null; neighborhood: string | null;
  min: number | null; max: number | null; beds: number; area: number; lang: string; trap: string;
}): Promise<InquiryResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_alert`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        p_slug: o.slug, p_name: o.name, p_phone: o.phone, p_purpose: o.purpose, p_type: o.type, p_neighborhood: o.neighborhood,
        p_min: o.min === null ? null : String(o.min), p_max: o.max === null ? null : String(o.max),
        p_beds: o.beds > 0 ? String(o.beds) : null, p_area: o.area > 0 ? String(o.area) : null, p_lang: o.lang, p_trap: o.trap,
      }),
    });
    if (r.ok) return 'ok';
    const text = await r.text();
    if (text.includes('alert_invalid')) return 'invalid';
    if (text.includes('inquiry_busy')) return 'busy';
    return 'error';
  } catch { return 'error'; }
}

/** Leave name, number and a message for the office. The database makes the lead and a call-back task. */
export async function submitInquiry(o: { slug: string; reference: string | null; name: string; phone: string; message: string; purpose?: string; trap: string }): Promise<InquiryResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_inquiry`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: o.slug, p_reference: o.reference ?? '', p_name: o.name, p_phone: o.phone, p_message: o.message, p_purpose: o.purpose ?? null, p_trap: o.trap }),
    });
    if (r.ok) return 'ok';
    const text = await r.text();
    if (text.includes('inquiry_invalid')) return 'invalid';
    if (text.includes('inquiry_busy')) return 'busy';
    return 'error';
  } catch { return 'error'; }
}

/** Hosts that are never an office domain: the Amplify address itself, previews and local testing. */
const PLATFORM = /(^localhost$)|(^127\.)|(\.pages\.dev$)|(\.workers\.dev$)/;

/** On an office's own domain: its office code. Null on the normal Amplify address (or when it cannot be checked). */
export async function resolveDomain(host: string): Promise<string | null> {
  if (!apiConfigured || PLATFORM.test(host)) return null;
  try { return await rpc<string>('public_office_by_domain', { p_host: host }); } catch { return null; }
}

export type PortalPayment = { due_date: string; amount_cents: number; status: 'due' | 'paid'; paid_on: string | null };
export type PortalRepair = { title: string; status: 'open' | 'in_progress' | 'done'; reported_on: string; done_on: string | null; cost_cents: number | null; cost_borne_by: 'owner' | 'tenant' | 'agency' | null };
export type PortalProperty = {
  reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; status: PropertyStatus; price_cents: number | null;
  city: string | null; neighborhood: string | null; cover: string | null;
  online: boolean; mandate_until: string | null; viewings_done: number; viewings_planned: number; interested: number; offers: number;
  page_views: number; contacts: number; sites: string[];
  lease: { tenant: string; rent_cents: number; start_date: string; end_date: string | null; payments: PortalPayment[] } | null;
  repairs: PortalRepair[];
};
export type PortalStatement = { period: string; property: string; reference: string; rent_cents: number; fee_pct: number; fee_cents: number; repairs_cents: number; payout_cents: number; status: 'open' | 'paid_out'; paid_out_on: string | null };
export type OwnerPortalData = { owner: { name: string }; lang: string; office: PublicOffice; properties: PortalProperty[]; statements?: PortalStatement[]; generated_at: string };

/** The owner portal behind a personal link. null = the link is not valid (anymore). */
export async function loadOwnerPortal(token: string): Promise<OwnerPortalData | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<OwnerPortalData>('public_owner_portal', { p_token: token });
}

export type ResidentPortalData = {
  lang: string; office: PublicOffice;
  residence: { name: string; address: string | null; city: string | null; rib: string | null };
  lot: { label: string; kind: string; floor: string | null; tantiemes: number; total_tantiemes: number; owner: string | null };
  charges: { title: string; due_date: string; amount_cents: number; paid_cents: number; paid_on: string | null }[];
  announcements: { title: string; body: string | null; date: string }[];
  incidents: { title: string; location: string | null; status: 'open' | 'in_progress' | 'done'; reported_on: string; done_on: string | null }[];
  assemblies: { title: string; held_at: string; place: string | null; status: 'planned' | 'held';
    resolutions: { position: number; text: string; majority: 'simple' | 'absolute' | 'three_quarters'; for: number; against: number; abstain: number }[] }[];
  generated_at: string;
};

/** The co-owner page behind a personal link from the syndic. null = the link is not valid (anymore). */
export async function loadResidentPortal(token: string): Promise<ResidentPortalData | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<ResidentPortalData>('public_resident_portal', { p_token: token });
}

export type DevUnitKind = 'apartment' | 'villa' | 'duplex' | 'studio' | 'shop' | 'office' | 'parking' | 'storage' | 'plot' | 'other';
export type PublicUnit = { reference: string; kind: DevUnitKind; building: string | null; floor: number | null; bedrooms: number | null; area_m2: number | null; terrace_m2: number | null; price_cents: number | null };
export type PublicProject = {
  name: string; slug: string; city: string | null; address: string | null; description: string | null; status: 'planning' | 'selling' | 'construction' | 'delivered';
  delivery_date: string | null; show_prices: boolean; photos: string[]; total_units: number; available_units: number;
};
export type ProjectPage = { office: PublicOffice; project: PublicProject; units: PublicUnit[] };
export type ProjectCard = { name: string; slug: string; city: string | null; status: PublicProject['status']; delivery_date: string | null; cover: string | null; available_units: number; price_from: number | null };

/** A new-build project of an office. null = not online (anymore). */
export async function loadProjectPage(slug: string, project: string): Promise<ProjectPage | null> {
  if (!SLUG.test(slug) || !SLUG.test(project)) return null;
  return rpc<ProjectPage>('public_project_page', { p_slug: slug, p_project: project });
}

/** The projects of an office for its website. Empty when etappe 10c is not installed. */
export async function loadOfficeProjects(slug: string): Promise<ProjectCard[]> {
  if (!SLUG.test(slug)) return [];
  try { return (await rpc<ProjectCard[]>('public_office_projects', { p_slug: slug })) ?? []; } catch { return []; }
}

export async function submitProjectInquiry(o: { slug: string; project: string; unit: string | null; name: string; phone: string; message: string; trap: string }): Promise<InquiryResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_project_inquiry`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: o.slug, p_project: o.project, p_name: o.name, p_phone: o.phone, p_message: o.message, p_unit: o.unit, p_trap: o.trap }),
    });
    if (r.ok) return 'ok';
    const text = await r.text();
    if (text.includes('inquiry_invalid')) return 'invalid';
    if (text.includes('inquiry_busy')) return 'busy';
    return 'error';
  } catch { return 'error'; }
}

export type GuestGuideData = {
  office: PublicOffice;
  property: { title: string; reference: string; city: string | null; neighborhood: string | null; address_note: string | null; bedrooms: number | null; photos: string[]; online: boolean };
  guide: { intro: string | null; arrival: string | null; checkin_time: string | null; checkout_time: string | null; wifi_name: string | null; wifi_password: string | null; rules: string | null; tips: string | null };
};

/** The guest page of a short-term rental behind its private link. null = the link is not valid (anymore). */
export async function loadGuestGuide(token: string): Promise<GuestGuideData | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<GuestGuideData>('public_stay_guide', { p_token: token });
}

export type CleanerTask = { id: string; due_date: string; title: string; city: string | null; neighborhood: string | null; address_note: string | null; next_arrival: string | null };
export type CleanerPageData = { cleaner: string; office: PublicOffice; tasks: CleanerTask[]; done: { title: string; done_at: string }[] };

/** The cleaning list behind the cleaner's private link. null = the link is not valid (anymore). */
export async function loadCleanerPage(token: string): Promise<CleanerPageData | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<CleanerPageData>('public_cleaner_page', { p_token: token });
}

/** Mark a cleaning as done, with a short note and a small photo (base64 jpeg without prefix). */
export async function markCleaned(token: string, task: string, note: string, photo: string | null): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/cleaner_mark_done`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: token, p_task: task, p_note: note, p_photo: photo }),
    });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

// ---------------------------------------------------------------- 12c: request a short stay
export type StayBooking = {
  price_cents: number; weekend_price_cents: number | null; cleaning_cents: number; deposit_cents: number; advance_pct: number; min_nights: number;
  max_guests: number | null; min_offer_pct: number | null; checkin_from: string | null; checkout_until: string | null; rules: string | null;
  busy: { start: string; end: string }[];
};
export type StayRequestStatus = 'new' | 'accepted' | 'paid_claimed' | 'confirmed' | 'declined' | 'counter' | 'expired' | 'cancelled';
export type StayRequestPage = {
  lang: string; status: StayRequestStatus; office: PublicOffice; property: { title: string; reference: string; city: string | null };
  request: { guest: string; check_in: string; check_out: string; nights: number; guests: number; quote_cents: number; offer_cents: number | null;
    total_cents: number; advance_cents: number; deposit_cents: number; hold_until: string | null; host_note: string | null };
  payment_info: string | null; contact: string | null; guide_token: string | null;
};
/** Prices and busy dates of a short-term rental. null = no requests for this property. */
export async function loadStayBooking(slug: string, reference: string): Promise<StayBooking | null> {
  if (!SLUG.test(slug)) return null;
  try { return await rpc<StayBooking>('public_stay_booking', { p_slug: slug, p_reference: reference }); } catch { return null; }
}
export type RequestResult = { token: string } | { error: string };
export async function submitStayRequest(o: { slug: string; reference: string; name: string; phone: string; guests: number; checkIn: string; checkOut: string;
  arrival: string; message: string; offerCents: number | null; rulesOk: boolean; lang: string; trap: string }): Promise<RequestResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_stay_request`, {
      method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: o.slug, p_reference: o.reference, p_name: o.name, p_phone: o.phone, p_guests: o.guests, p_in: o.checkIn, p_out: o.checkOut,
        p_arrival: o.arrival || null, p_message: o.message || null, p_offer_cents: o.offerCents, p_rules_ok: o.rulesOk, p_lang: o.lang, p_trap: o.trap || null }),
    });
    const text = await r.text();
    if (r.ok) return { token: JSON.parse(text) as string };
    const m = text.match(/request_[a-z_]+/);
    return { error: m ? m[0] : 'error' };
  } catch { return { error: 'error' }; }
}
export async function loadStayRequest(token: string): Promise<StayRequestPage | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return rpc<StayRequestPage>('public_stay_request', { p_token: token });
}
export async function guestStayRequest(token: string, action: 'paid' | 'accept_counter' | 'cancel'): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/guest_stay_request`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ p_token: token, p_action: action }) });
    return r.ok;
  } catch { return false; }
}

export type VoucherPage = {
  office: { name: string; slug: string; city: string | null; whatsapp: string | null; phone: string | null; agent_name: string | null; edition: string };
  property: { reference: string; title: string; property_type: PropertyType; purpose: DealPurpose; city: string | null; neighborhood: string | null };
  visitor_name: string; visitor_phone: string; months: number; visited_at: string; signature: string; number: string;
};
/** The visitor's copy of a signed visit voucher. */
export async function loadVoucher(token: string): Promise<VoucherPage | null> {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  return rpc<VoucherPage>('public_visit_voucher', { p_token: token });
}

export type EstimateRange = { scope: 'neighborhood' | 'office' | 'none'; count?: number; low?: number; high?: number; per_m2?: number };
/** The price range for an owner's property, from the office's own comparable properties (at least 3). */
export async function loadEstimate(slug: string, purpose: string, type: string, neighborhood: string, area: number): Promise<EstimateRange | null> {
  try { return await rpc<EstimateRange>('public_estimate', { p_slug: slug, p_purpose: purpose, p_type: type, p_neighborhood: neighborhood, p_area: String(area) }); }
  catch { return null; }
}
export async function submitEstimation(o: { slug: string; name: string; phone: string; purpose: string; type: string; neighborhood: string; area: number | null; bedrooms: number | null; condition: string | null; message: string; trap: string }): Promise<InquiryResult> {
  try {
    const r = await fetch(`${BASE}/rest/v1/rpc/submit_estimation`, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: o.slug, p_name: o.name, p_phone: o.phone, p_purpose: o.purpose, p_type: o.type, p_neighborhood: o.neighborhood || null,
        p_area: o.area, p_bedrooms: o.bedrooms, p_condition: o.condition, p_message: o.message || null, p_trap: o.trap }),
    });
    if (r.ok) return 'ok';
    const text = await r.text();
    if (text.includes('estimation_invalid')) return 'invalid';
    if (text.includes('estimation_busy')) return 'busy';
    return 'error';
  } catch { return 'error'; }
}

export type BlogPage = { office: PublicOffice; posts: PostCard[] };
export type PostPage = { office: PublicOffice; post: PostCard & { body: string }; more: PostCard[] };
export async function loadBlog(slug: string): Promise<BlogPage | null> {
  if (!SLUG.test(slug)) return null;
  return rpc<BlogPage>('public_blog', { p_slug: slug });
}
export async function loadPost(slug: string, post: string): Promise<PostPage | null> {
  if (!SLUG.test(slug) || !SLUG.test(post)) return null;
  return rpc<PostPage>('public_post', { p_slug: slug, p_post: post });
}
