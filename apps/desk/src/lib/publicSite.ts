// Links to the public pages (apps/pages). The address of that site is set once with
// VITE_PUBLIC_SITE_URL (for example https://pages.example.com), without a slash at the end.

export type ShareLang = 'fr' | 'ar' | 'en';
export const SHARE_LANGS: ShareLang[] = ['fr', 'ar', 'en'];

export const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

export const officeUrl = (slug: string, lang: ShareLang) => `${PUBLIC_SITE}/${slug}?lang=${lang}`;
export const propertyUrl = (slug: string, reference: string, lang: ShareLang) =>
  `${PUBLIC_SITE}/${slug}/${encodeURIComponent(reference)}?lang=${lang}`;

/** "Share with WhatsApp": the person picks the contact in WhatsApp itself. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
