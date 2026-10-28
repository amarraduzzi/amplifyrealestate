import { formatMad, type DealPurpose, type PropertyType } from '@vastgoed/shared';
import { supabase } from './supabase';
import { PUBLIC_SITE, propertyUrl } from './publicSite';
import type { PropertyRow } from './types';

export type Site = 'mubawab' | 'avito' | 'facebook' | 'instagram' | 'sarouty' | 'other';
export type AdLang = 'fr' | 'ar';
export type PostingRow = {
  id: string; org_id: string; property_id: string; site: Site; status: 'online' | 'removed';
  posted_on: string; removed_on: string | null; url: string | null;
};

/** The sites, in the order of the screen. Portals get a plain text; social media get a text with a link and the contact. */
export const SITES: { id: Site; name: string; social: boolean; newUrl?: string }[] = [
  { id: 'mubawab', name: 'Mubawab', social: false, newUrl: 'https://www.mubawab.ma' },
  { id: 'avito', name: 'Avito', social: false, newUrl: 'https://www.avito.ma' },
  { id: 'sarouty', name: 'Sarouty', social: false, newUrl: 'https://www.sarouty.ma' },
  { id: 'facebook', name: 'Facebook', social: true, newUrl: 'https://www.facebook.com/marketplace/create' },
  { id: 'instagram', name: 'Instagram', social: true },
  { id: 'other', name: 'Other', social: false },
];
export const siteName = (s: Site) => SITES.find(x => x.id === s)?.name ?? s;

const TYPE: Record<AdLang, Record<PropertyType, string>> = {
  fr: { apartment: 'Appartement', villa: 'Villa', riad: 'Riad', house: 'Maison', land: 'Terrain', shop: 'Local commercial', office: 'Bureau', building: 'Immeuble', other: 'Bien' },
  ar: { apartment: 'شقة', villa: 'فيلا', riad: 'رياض', house: 'منزل', land: 'أرض', shop: 'محل تجاري', office: 'مكتب', building: 'عمارة', other: 'عقار' },
};
const DEAL: Record<AdLang, Record<DealPurpose, string>> = {
  fr: { sale: 'à vendre', rent_long: 'à louer', rent_short: 'location courte durée' },
  ar: { sale: 'للبيع', rent_long: 'للكراء', rent_short: 'كراء لمدة قصيرة' },
};
const W = {
  fr: {
    rooms: (n: number) => `${n} chambre${n > 1 ? 's' : ''}`, baths: (n: number) => `${n} salle${n > 1 ? 's' : ''} de bain`,
    area: 'Surface', price: 'Prix', month: ' / mois', night: ' / nuit', furnished: 'Meublé', unfurnished: 'Non meublé',
    ref: 'Référence', in: 'à', contact: 'Contact', more: 'Plus de photos et détails', visit: 'Visite sur rendez-vous.',
    tags: ['immobilier', 'maroc'],
  },
  ar: {
    rooms: (n: number) => `${n} غرف`, baths: (n: number) => `${n} حمام`,
    area: 'المساحة', price: 'الثمن', month: ' / شهريا', night: ' / لليلة', furnished: 'مفروش', unfurnished: 'غير مفروش',
    ref: 'المرجع', in: 'في', contact: 'للتواصل', more: 'المزيد من الصور والتفاصيل', visit: 'الزيارة بموعد مسبق.',
    tags: ['عقارات', 'المغرب'],
  },
};

type Office = { name: string; slug: string; public_whatsapp?: string | null; public_phone?: string | null };

const place = (p: PropertyRow) => [p.neighborhood, p.city].filter(Boolean).join(', ');
const priceText = (p: PropertyRow, lang: AdLang) =>
  p.price_cents === null ? '' : `${formatMad(p.price_cents)}${p.purpose === 'rent_long' ? W[lang].month : p.purpose === 'rent_short' ? W[lang].night : ''}`;

/** A short title: "Appartement 3 chambres 115 m² à vendre à Agdal, Rabat". Kept under 70 characters. */
export function adTitle(p: PropertyRow, lang: AdLang): string {
  const w = W[lang];
  const parts = [TYPE[lang][p.property_type]];
  if (p.bedrooms) parts.push(w.rooms(p.bedrooms));
  if (p.area_m2) parts.push(`${Number(p.area_m2)} m²`);
  parts.push(DEAL[lang][p.purpose]);
  const where = place(p);
  let s = parts.join(' ') + (where ? ` ${w.in} ${where}` : '');
  if (s.length > 70 && p.neighborhood) s = parts.join(' ') + ` ${w.in} ${p.neighborhood}`;
  return s.length > 70 ? s.slice(0, 69).trimEnd() + '…' : s;
}

/** The full text. Portals: no phone number or link (most refuse them, contact goes through the portal). Social media: with both. */
export function adText(p: PropertyRow, lang: AdLang, site: Site, office: Office): string {
  const w = W[lang];
  const social = SITES.find(x => x.id === site)?.social ?? false;
  const facts: string[] = [];
  if (p.area_m2) facts.push(`${w.area} : ${Number(p.area_m2)} m²`);
  if (p.bedrooms) facts.push(w.rooms(p.bedrooms));
  if (p.bathrooms) facts.push(w.baths(p.bathrooms));
  if (p.furnished !== null && p.property_type !== 'land') facts.push(p.furnished ? w.furnished : w.unfurnished);
  const price = priceText(p, lang);
  if (price) facts.push(`${w.price} : ${price}`);
  const bullet = social ? '✅ ' : '- ';

  const lines: string[] = [];
  lines.push(social ? `🏡 ${adTitle(p, lang)}` : adTitle(p, lang));
  if (social && place(p)) lines.push(`📍 ${place(p)}`);
  lines.push('');
  if (p.description?.trim()) { lines.push(p.description.trim()); lines.push(''); }
  for (const f of facts) lines.push(bullet + f);
  lines.push('');
  lines.push(w.visit);
  lines.push(`${w.ref} : ${p.reference}`);
  if (social) {
    if (PUBLIC_SITE && p.is_published) lines.push('', `${w.more} : ${propertyUrl(office.slug, p.reference, lang)}`);
    const tel = office.public_whatsapp || office.public_phone;
    lines.push('', `📞 ${w.contact} : ${office.name}${tel ? ` · ${tel}` : ''}`);
    const tags = [p.city, p.neighborhood, ...w.tags].filter(Boolean).map(x => '#' + String(x).replace(/[\s'’-]+/g, ''));
    lines.push('', tags.join(' '));
  } else {
    lines.push(office.name);
  }
  return lines.join('\n');
}

/** The fields most portal forms ask for, ready to copy one by one. */
export function adFields(p: PropertyRow, lang: AdLang): { label: string; value: string }[] {
  const w = W[lang];
  const out = [
    { label: lang === 'fr' ? 'Type' : 'النوع', value: TYPE[lang][p.property_type] },
    { label: lang === 'fr' ? 'Transaction' : 'المعاملة', value: DEAL[lang][p.purpose] },
    { label: lang === 'fr' ? 'Ville' : 'المدينة', value: p.city ?? '' },
    { label: lang === 'fr' ? 'Quartier' : 'الحي', value: p.neighborhood ?? '' },
    { label: w.area, value: p.area_m2 ? `${Number(p.area_m2)}` : '' },
    { label: lang === 'fr' ? 'Chambres' : 'الغرف', value: p.bedrooms != null ? String(p.bedrooms) : '' },
    { label: lang === 'fr' ? 'Salles de bain' : 'الحمامات', value: p.bathrooms != null ? String(p.bathrooms) : '' },
    { label: w.price, value: p.price_cents != null ? String(Math.round(p.price_cents / 100)) : '' },
  ];
  return out.filter(x => x.value !== '');
}

/** The advertisements of one property. Empty when the 6d table is not installed yet. */
export async function loadPostings(propertyId: string): Promise<PostingRow[] | null> {
  const r = await supabase.from('property_postings').select('*').eq('property_id', propertyId);
  return r.error ? null : (r.data ?? []) as PostingRow[];
}

/** Mark a property as online on a site (or online again), with an optional link. Returns an error message or null. */
export async function setOnline(orgId: string, propertyId: string, site: Site, url: string, existing?: PostingRow): Promise<string | null> {
  const clean = url.trim() || null;
  const r = existing
    ? await supabase.from('property_postings').update({ status: 'online', url: clean, ...(existing.status === 'removed' ? { posted_on: todayLocal() } : {}) }).eq('id', existing.id).select('id')
    : await supabase.from('property_postings').insert({ org_id: orgId, property_id: propertyId, site, url: clean }).select('id');
  if (r.error) return r.error.message;
  return r.data?.length ? null : 'You do not have permission to change this.';
}

export async function setRemoved(p: PostingRow): Promise<string | null> {
  const r = await supabase.from('property_postings').update({ status: 'removed' }).eq('id', p.id).select('id');
  if (r.error) return r.error.message;
  return r.data?.length ? null : 'You do not have permission to change this.';
}

/** Ads still online for properties that are no longer for sale or rent: they should come down. */
export async function loadStaleAds(orgId: string): Promise<{ id: string; site: Site; title: string }[]> {
  const r = await supabase.from('property_postings').select('id, site, property_id').eq('org_id', orgId).eq('status', 'online');
  if (r.error || !r.data?.length) return [];
  const rows = r.data as { id: string; site: Site; property_id: string }[];
  const pr = await supabase.from('properties').select('id, title, status').in('id', Array.from(new Set(rows.map(x => x.property_id))));
  if (pr.error) return [];
  const gone = new Map(((pr.data ?? []) as { id: string; title: string; status: string }[])
    .filter(x => !['available', 'reserved'].includes(x.status)).map(x => [x.id, x.title]));
  return rows.filter(x => gone.has(x.property_id)).map(x => ({ id: x.id, site: x.site, title: gone.get(x.property_id)! }));
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
