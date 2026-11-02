import { Check, ChevronDown, Handshake, KeyRound, Link2, MessageCircle, QrCode, Users, type LucideIcon } from 'lucide-react';
import { t } from '../lib/i18n';
import { AmplifyLogo } from '../components/Brand';
import { Layout } from '../components/Layout';
import { CONTACT_WHATSAPP, DEMO_URL, DESK_URL, PILOT, PRICES } from '../lib/homeConfig';

const whatsapp = (text: string) => (CONTACT_WHATSAPP ? `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}` : '');

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Link2, title: 'A page for every property', text: 'Share one link on WhatsApp: photos, price and details in French, Arabic and English.' },
  { icon: QrCode, title: 'Window card with QR code', text: 'A clean A4 or A3 for your shop window, with a QR code to the property page.' },
  { icon: MessageCircle, title: 'Weekly update for the owner', text: 'Views and contacts per property, sent to the owner on WhatsApp in one tap.' },
  { icon: Users, title: 'Clients and matches', text: 'Keep track of buyers and tenants and see which property fits who.' },
  { icon: Handshake, title: 'Deals and commissions', text: 'Follow every deal from visit to signature, with documents and commission splits.' },
  { icon: KeyRound, title: 'Rental management', text: 'Leases, rent, repairs and a clear statement for the owner.' },
];

const FAQ: { q: string; a: string; vars?: Record<string, number> }[] = [
  { q: 'How much does it cost?', a: 'See the prices above. A single agent can start free with up to {n} properties.', vars: { n: PRICES.agent.freeProperties } },
  { q: 'Is there a free trial?', a: 'Yes, 30 days. After that everything becomes read-only and your data stays safe until you choose a plan.' },
  { q: 'Do I have to install something?', a: 'No. It works in the browser on a phone or a computer.' },
  { q: 'Which languages does it speak?', a: 'French, Arabic (right to left) and English. Your clients choose the language of the property page.' },
  { q: 'What can the public see about my properties?', a: 'Only what you publish: photos, price, details and the neighborhood. Never the exact address, the owner, notes or your clients.' },
  { q: 'Are messages sent automatically?', a: 'No. A message opens in WhatsApp and you send it yourself. Automatic sending needs the paid WhatsApp Business API and may come later.' },
  { q: 'How do I pay?', a: 'For now by bank transfer or cash, against an invoice. Online payment may come later.' },
];

const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/ /g, ' ');

function Plan({ name, who, lines, trial }: { name: string; who: string; lines: string[]; trial?: boolean }) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-5 ring-1 ring-line/10">
      <h3 className="font-display text-lg font-bold">{t(name)}</h3>
      <p className="mt-0.5 text-sm text-muted">{t(who)}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {lines.map(l => (
          <li key={l} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /><span>{l}</span></li>
        ))}
      </ul>
      {trial && <p className="mt-4 text-xs font-semibold text-muted">{t('Free for 30 days, then you decide.')}</p>}
    </div>
  );
}

export function Home() {
  const contact = whatsapp(t('Hello, I would like to know more about Amplify Real Estate.'));
  const pilot = whatsapp(t('Hello, I would like to join the founding offices pilot of Amplify Real Estate.'));
  const btn = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition';
  const primary = `${btn} bg-brand text-brand-ink hover:bg-brand-hi`;
  const secondary = `${btn} bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15`;

  return (
    <Layout>
      <section className="night px-4 pb-12 pt-10 text-center sm:px-6">
        <div className="mx-auto max-w-2xl">
          <AmplifyLogo size="lg" className="justify-center" />
          <h1 className="mt-8 font-display text-3xl font-bold sm:text-4xl">{t('Moroccan real estate, shared simply.')}</h1>
          <p className="mt-4 text-base text-white/75">{t('The desk for Moroccan real estate agents: your properties, clients, deals and rentals in one place, with a clean public page for every property.')}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {DESK_URL && <a href={DESK_URL} className={primary}>{t('Start free')}</a>}
            {contact && <a href={contact} className={DESK_URL ? secondary : primary} target="_blank" rel="noreferrer">{t('Talk to us on WhatsApp')}</a>}
            {DEMO_URL && <a href={DEMO_URL} className={secondary}>{t('See a demo')}</a>}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl space-y-14 px-4 py-12 sm:px-6">
        <section>
          <h2 className="font-display text-2xl font-bold">{t('What you get')}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl bg-surface p-4 ring-1 ring-line/10">
                <f.icon className="h-5 w-5 text-ok" aria-hidden />
                <h3 className="mt-2 text-sm font-bold">{t(f.title)}</h3>
                <p className="mt-1 text-sm text-muted">{t(f.text)}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">{t('Prices')}</h2>
          <p className="mt-1 text-sm text-muted">{t('Prices in DH, excluding taxes. Pay by bank transfer or cash against an invoice.')}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Plan name="Amplify Agent" who="For an agent who works alone" trial
              lines={[
                t('Free up to {n} properties', { n: PRICES.agent.freeProperties }),
                t('Then {price} DH per month, unlimited properties', { price: fmt(PRICES.agent.month) }),
                t('or {price} DH per year', { price: fmt(PRICES.agent.year) }),
              ]} />
            <Plan name="Amplify Agence" who="For a small office" trial
              lines={[
                t('Up to {n} team members', { n: PRICES.agence.members }),
                t('Rentals, management, invoices and owners'),
                t('{price} DH per month', { price: fmt(PRICES.agence.month) }),
                t('or {price} DH per year', { price: fmt(PRICES.agence.year) }),
              ]} />
            <Plan name="Amplify Agence+" who="For a larger office" trial
              lines={[
                t('Up to {n} team members', { n: PRICES.agencePlus.members }),
                t('Rentals, management, invoices and owners'),
                t('{price} DH per month', { price: fmt(PRICES.agencePlus.month) }),
                t('or {price} DH per year', { price: fmt(PRICES.agencePlus.year) }),
              ]} />
          </div>
        </section>

        <section className="rounded-2xl bg-surface-2 p-5 ring-1 ring-line/10 sm:p-6">
          <h2 className="font-display text-2xl font-bold">{t('Founding offices pilot')}</h2>
          <p className="mt-2 text-sm">{t('We are looking for {n} offices in Morocco to build this with us.', { n: PILOT.offices })}</p>
          <p className="mt-2 text-sm">{t('You get {n} months free, then a fixed price of {price} DH per month for Agence for as long as you stay active.', { n: PILOT.freeMonths, price: PILOT.priceAfter })}</p>
          <p className="mt-2 text-sm text-muted">{t('In return we ask for your honest feedback. We will only use your name and words with your permission.')}</p>
          <p className="mt-2 text-sm text-muted">{t('We have no customer logos to show yet, so you can try it yourself.')}</p>
          {(pilot || DEMO_URL) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {pilot && <a href={pilot} target="_blank" rel="noreferrer" className={`${btn} bg-ink text-bg hover:opacity-90`}>{t('Join the pilot')}</a>}
              {DEMO_URL && <a href={DEMO_URL} className={`${btn} ring-1 ring-line/20 hover:bg-surface`}>{t('See a demo')}</a>}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">{t('Questions')}</h2>
          <div className="mt-5 divide-y divide-line/10 rounded-2xl bg-surface ring-1 ring-line/10">
            {FAQ.map(item => (
              <details key={item.q} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {t(item.q)}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm text-muted">{t(item.a, item.vars)}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
