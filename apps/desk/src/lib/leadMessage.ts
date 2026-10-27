import { formatMad } from '@vastgoed/shared';
import type { DealPurpose } from '@vastgoed/shared';
import type { ShareLang } from './publicSite';
import { propertyUrl, PUBLIC_SITE } from './publicSite';
import type { MatchProp } from './matching';

// The message goes to a client in the client's own language, which can differ from the language of the app,
// so these texts live here and not in the app dictionaries.
const W = {
  fr: {
    hello: (name: string, n: number) => `Bonjour ${name}, voici ${n > 1 ? 'des biens qui correspondent' : 'un bien qui correspond'} à votre recherche :`,
    suffix: { sale: '', rent_long: ' / mois', rent_short: ' / nuit' } as Record<DealPurpose, string>,
    close: 'Dites-moi lequel vous intéresse, je peux organiser une visite.',
  },
  ar: {
    hello: (name: string, n: number) => `مرحبا ${name}، إليك ${n > 1 ? 'عقارات تناسب' : 'عقارا يناسب'} بحثك:`,
    suffix: { sale: '', rent_long: ' / الشهر', rent_short: ' / الليلة' } as Record<DealPurpose, string>,
    close: 'أخبرني أيها يهمك ويمكنني ترتيب معاينة.',
  },
  en: {
    hello: (name: string, n: number) => `Hello ${name}, here ${n > 1 ? 'are properties that match' : 'is a property that matches'} your search:`,
    suffix: { sale: '', rent_long: ' / month', rent_short: ' / night' } as Record<DealPurpose, string>,
    close: 'Tell me which one interests you and I can arrange a viewing.',
  },
};

/** WhatsApp text with the chosen properties. A property with its public page on gets a link; the others are sent as text only. */
export function matchesMessage(opts: { lang: ShareLang; name: string; office: { name: string; slug: string }; props: MatchProp[] }): string {
  const w = W[opts.lang];
  const lines = opts.props.map(p => {
    const place = [p.neighborhood, p.city].filter(Boolean).join(', ');
    const price = p.price_cents === null ? '' : `${formatMad(p.price_cents)}${w.suffix[p.purpose]}`;
    const head = [p.title, price, place].filter(Boolean).join(' · ');
    const link = PUBLIC_SITE && p.is_published ? `\n${propertyUrl(opts.office.slug, p.reference, opts.lang)}` : '';
    return `• ${head}${link}`;
  });
  return [w.hello(opts.name, opts.props.length), '', lines.join('\n\n'), '', w.close, `— ${opts.office.name}`].join('\n');
}

const REMIND = {
  fr: { locale: 'fr-FR', hello: (n: string) => `Bonjour ${n},`, body: (when: string, what: string) => `je vous rappelle notre visite ${when} : ${what}.`, close: 'Merci de me prévenir en cas d’empêchement.' },
  ar: { locale: 'ar-MA', hello: (n: string) => `مرحبا ${n}،`, body: (when: string, what: string) => `أذكّركم بموعد المعاينة ${when}: ${what}.`, close: 'المرجو إخباري في حال حدوث أي مانع.' },
  en: { locale: 'en-GB', hello: (n: string) => `Hello ${n},`, body: (when: string, what: string) => `a reminder of our viewing ${when}: ${what}.`, close: 'Please let me know if you cannot make it.' },
};

/** WhatsApp reminder of a viewing, in the language of the client. */
export function viewingReminder(opts: { lang: ShareLang; name: string; whenIso: string; propertyTitle: string; office: { name: string } }): string {
  const r = REMIND[opts.lang];
  const when = new Intl.DateTimeFormat(r.locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(opts.whenIso));
  return [r.hello(opts.name), r.body(when, opts.propertyTitle), r.close, `— ${opts.office.name}`].join('\n');
}
