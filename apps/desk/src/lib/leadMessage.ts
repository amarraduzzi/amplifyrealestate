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
