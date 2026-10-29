import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Calculator, CheckCircle2, Eye, Handshake, HardHat, Home, KeyRound, MessageCircle, PenLine, Users, Video } from 'lucide-react';
import { t } from '../lib/i18n';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type ServiceAction =
  | { kind: 'listings'; purpose: 'sale' | 'rent_long' }
  | { kind: 'estimate' } | { kind: 'projects' } | { kind: 'whatsapp'; text: string };

type Kind = 'estimate' | 'video' | 'manage' | 'rent' | 'sale' | 'new' | 'other';

/** What a service line from the office is about, so it gets the right icon, a short explanation and a button. */
function kindOf(line: string): Kind {
  const s = norm(line);
  if (/estim|evalu|expertis|valeur|valuat|waarde|تقييم/.test(s)) return 'estimate';
  if (/video|mre|etranger|distance|abroad|buitenland|فيديو/.test(s)) return 'video';
  if (/gestion|syndic|gerance|manag|beheer|تسيير/.test(s)) return 'manage';
  if (/neuf|projet|programme|promot|new-build|nieuwbouw|project/.test(s)) return 'new';
  if (/locat|louer|loyer|rent|huur|كراء/.test(s)) return 'rent';
  if (/vent|achat|vendre|acheter|buy|sell|kopen|verkopen|بيع|شراء/.test(s)) return 'sale';
  return 'other';
}

const ICON: Record<Kind, ReactNode> = {
  estimate: <Calculator className="h-6 w-6" />, video: <Video className="h-6 w-6" />, manage: <KeyRound className="h-6 w-6" />,
  rent: <Users className="h-6 w-6" />, sale: <Home className="h-6 w-6" />, new: <HardHat className="h-6 w-6" />, other: <CheckCircle2 className="h-6 w-6" />,
};

function details(k: Kind): { text: string; cta: string; action: ServiceAction } {
  switch (k) {
    case 'estimate': return { text: t('A fair price range in two minutes, then the opinion of an agent who knows the street.'), cta: t('Estimate my property'), action: { kind: 'estimate' } };
    case 'video': return { text: t('Visit from abroad, live on WhatsApp video, with an agent on site who answers your questions.'), cta: t('Book a video visit'), action: { kind: 'whatsapp', text: t('Hello, I would like a video visit of a property.') } };
    case 'manage': return { text: t('Rent, tenants, repairs and paperwork: we take care of it, you get a clear statement every month.'), cta: t('Talk about my property'), action: { kind: 'whatsapp', text: t('Hello, I am looking for rental management for my property.') } };
    case 'rent': return { text: t('Checked properties, quick visits and a clear lease, for families and professionals.'), cta: t('See the rentals'), action: { kind: 'listings', purpose: 'rent_long' } };
    case 'sale': return { text: t('Buy or sell at the right price, with follow-up all the way to the notary.'), cta: t('See the properties for sale'), action: { kind: 'listings', purpose: 'sale' } };
    case 'new': return { text: t('New-build projects with plans, prices and delivery dates, straight from the developer.'), cta: t('See the projects'), action: { kind: 'projects' } };
    default: return { text: '', cta: t('Ask us'), action: { kind: 'whatsapp', text: t('Hello, I would like information about your services.') } };
  }
}

/** The services as tiles: each one says what it brings and opens the right next step. */
export function ServiceTiles({ services, onAction }: { services: string[]; onAction: (a: ServiceAction) => void }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {services.map(s => {
        const k = kindOf(s);
        const d = details(k);
        return (
          <li key={s}>
            <button type="button" onClick={() => onAction(d.action)}
              className="group flex h-full w-full flex-col rounded-3xl bg-surface p-5 text-start ring-1 ring-line/[0.08] transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-brand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand transition duration-300 group-hover:bg-brand group-hover:text-white">{ICON[k]}</span>
              <span className="mt-4 font-display text-lg font-bold leading-snug">{s}</span>
              {d.text && <span className="mt-1.5 text-sm leading-relaxed text-muted">{d.text}</span>}
              <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-bold text-brand">
                {d.action.kind === 'whatsapp' && <MessageCircle className="h-4 w-4" />}{d.cta}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** From first call to the keys: four steps, and a line that fills as the visitor scrolls through them. */
export function ProcessSteps() {
  const box = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setP(1); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      // starts when the steps enter the lower part of the screen, full when they reach the upper third
      setP(Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (r.height + vh * 0.35))));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const steps = [
    { icon: <MessageCircle className="h-5 w-5" />, title: t('We get to know you'), text: t('Your wishes, your budget, your timing. A short call or a WhatsApp is enough.'), when: t('Day 1') },
    { icon: <Eye className="h-5 w-5" />, title: t('Visits'), text: t('We select and visit with you, or by video if you live abroad.'), when: t('1 to 3 weeks') },
    { icon: <Handshake className="h-5 w-5" />, title: t('Offer and agreement'), text: t('We negotiate for you and check the land title and the papers.'), when: t('1 to 2 weeks') },
    { icon: <PenLine className="h-5 w-5" />, title: t('Notary and keys'), text: t('Signing at the notary, then the handover of the keys.'), when: t('4 to 8 weeks') },
  ];
  const n = steps.length;

  return (
    <div ref={box} className="relative">
      {/* the line: across on a computer, down on a phone */}
      <div className="absolute start-[1.375rem] top-6 h-[calc(100%-3rem)] w-0.5 rounded-full bg-line/10 lg:start-6 lg:end-6 lg:top-[1.375rem] lg:h-0.5 lg:w-auto" aria-hidden="true">
        <div className="h-full w-full origin-top rounded-full bg-brand transition-transform duration-150 lg:hidden" style={{ transform: `scaleY(${p})` }} />
        <div className="hidden h-full w-full origin-left rounded-full bg-brand transition-transform duration-150 lg:block rtl:origin-right" style={{ transform: `scaleX(${p})` }} />
      </div>
      <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
        {steps.map((s, i) => {
          const on = p >= (n === 1 ? 0 : i / (n - 1)) - 0.02;
          return (
            <li key={s.title} className="flex gap-4 lg:flex-col lg:gap-0">
              <span className={`relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full ring-4 ring-bg transition duration-500 ${on ? 'scale-100 bg-brand text-white shadow-lg shadow-brand/30' : 'scale-90 bg-surface text-muted ring-1'}`}>{s.icon}</span>
              <div className={`transition duration-500 lg:mt-5 ${on ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-45'}`}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{t('Step {n}', { n: i + 1 })} · {s.when}</p>
                <p className="mt-1 font-display text-lg font-bold">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs text-muted">{t('Usual durations for a purchase in Morocco. Every file is different.')}</p>
    </div>
  );
}
