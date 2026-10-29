import { useState, type ReactNode } from 'react';
import {
  ArrowUpDown, BadgeCheck, Calculator, CookingPot, Fence, GraduationCap, HandCoins, Landmark, ScrollText, ShieldCheck,
  ShoppingBag, Snowflake, SquareParking, Sun, Sunset, TramFront, Trees, Umbrella, UserRound, Video, WavesLadder, Wifi,
} from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { photoUrl, type NearKey, type PublicAgent } from '../lib/api';
import { t } from '../lib/i18n';
import {
  EUR_MAD, FEES, FEES_PCT, NEAR_ORDER, featureLabel, formatEur, housingAid, langLabel, monthly, nearLabel, titleStatusLabel,
} from '../lib/vitrine';

const FEATURE_ICON: Record<string, ReactNode> = {
  gated: <Fence className="h-5 w-5" />, guard: <ShieldCheck className="h-5 w-5" />, elevator: <ArrowUpDown className="h-5 w-5" />,
  parking: <SquareParking className="h-5 w-5" />, pool: <WavesLadder className="h-5 w-5" />, garden: <Trees className="h-5 w-5" />,
  terrace: <Sun className="h-5 w-5" />, sea_view: <Sunset className="h-5 w-5" />, air_con: <Snowflake className="h-5 w-5" />,
  equipped_kitchen: <CookingPot className="h-5 w-5" />, fiber: <Wifi className="h-5 w-5" />, solar: <Sun className="h-5 w-5" />,
};
const NEAR_ICON: Record<NearKey, ReactNode> = {
  beach: <Umbrella className="h-4 w-4" />, transport: <TramFront className="h-4 w-4" />, school: <GraduationCap className="h-4 w-4" />,
  mosque: <Landmark className="h-4 w-4" />, shops: <ShoppingBag className="h-4 w-4" />,
};

/** Legal status next to the price. A titre foncier is the strongest argument, so it gets the green check. */
export function TitleBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const strong = status === 'titre';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${strong ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-muted'}`}>
      {strong ? <BadgeCheck className="h-3.5 w-3.5" /> : <ScrollText className="h-3.5 w-3.5" />}{titleStatusLabel(status)}
    </span>
  );
}

/** For buyers abroad: the price in euro, rounded to the thousand, clearly marked as indicative. */
export function EuroLine({ cents, suffix = '' }: { cents: number | null; suffix?: string }) {
  if (cents === null || cents <= 0) return null;
  return (
    <p className="mt-0.5 text-sm text-muted" title={t('Indicative rate: 1 € ≈ {rate} DH', { rate: EUR_MAD.toLocaleString() })}>
      ≈ <span className="tabular font-semibold text-ink/80">{formatEur(cents)}</span>{suffix} · {t('for buyers abroad')}
    </p>
  );
}

/** The state housing aid, only for a sale in the price range. Honest about the conditions. */
export function AideBadge({ cents, newBuild = false }: { cents: number | null; newBuild?: boolean }) {
  const aid = housingAid(cents);
  if (aid === null) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand/[0.06] p-3.5 ring-1 ring-brand/15">
      <HandCoins className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      <div>
        <p className="text-sm font-bold">{newBuild ? t('Eligible for the housing aid: up to {amount}', { amount: formatMad(aid) }) : t('Possible housing aid: up to {amount}', { amount: formatMad(aid) })}</p>
        <p className="mt-0.5 text-xs text-muted">{t('State programme 2024 to 2028, for a first home and a first sale of a new home, under conditions. Ask us.')}</p>
      </div>
    </div>
  );
}

/** "Points forts": the features as large tiles, so a buyer sees in two seconds why this one is special. */
export function Highlights({ features }: { features: string[] | undefined }) {
  if (!features?.length) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold">{t('Highlights')}</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2.5 rounded-2xl bg-surface p-3 text-sm font-semibold ring-1 ring-line/[0.08]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/[0.08] text-brand">{FEATURE_ICON[f] ?? <BadgeCheck className="h-5 w-5" />}</span>
            {featureLabel(f)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Minutes to the places that matter in Morocco. */
export function NearList({ near }: { near: Partial<Record<NearKey, number>> | undefined }) {
  const keys = NEAR_ORDER.filter(k => near?.[k] !== undefined && near?.[k] !== null);
  if (!keys.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {keys.map(k => (
        <li key={k} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line/[0.08]">
          <span className="text-brand">{NEAR_ICON[k]}</span><span className="font-semibold">{nearLabel(k)}</span><span className="tabular text-muted">{t('{n} min', { n: near![k]! })}</span>
        </li>
      ))}
    </ul>
  );
}

/** The person behind the WhatsApp button. */
export function AgentBlock({ agent, compact = false }: { agent: PublicAgent | null | undefined; compact?: boolean }) {
  if (!agent) return null;
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'rounded-2xl bg-surface p-3.5 ring-1 ring-line/[0.08]'}`}>
      {agent.photo
        ? <img src={photoUrl(agent.photo, true)} alt="" className="h-12 w-12 shrink-0 rounded-full bg-surface-3 object-cover" />
        : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><UserRound className="h-6 w-6" /></span>}
      <div className="min-w-0">
        <p className="truncate font-semibold leading-tight">{agent.name}</p>
        {agent.role && <p className="truncate text-xs text-muted">{agent.role}</p>}
        {agent.langs.length > 0 && <p className="mt-0.5 truncate text-xs text-muted">{t('Speaks {langs}', { langs: agent.langs.map(langLabel).join(', ') })}</p>}
      </div>
    </div>
  );
}

/** Ask for a video visit on WhatsApp: for buyers in Europe who cannot come. */
export function VideoVisitButton({ href, onClick }: { href: string; onClick?: () => void }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/[0.06]">
      <Video className="h-4 w-4" /> {t('Video visit on WhatsApp')}
    </a>
  );
}

const Slider = ({ label, value, shown, min, max, step, onChange }: { label: string; value: number; shown: string; min: number; max: number; step: number; onChange: (n: number) => void }) => (
  <label className="block">
    <span className="flex items-baseline justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular font-bold">{shown}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-brand" />
  </label>
);

/** What it costs per month and what you need on day one: the questions every buyer asks. */
export function MortgageCalc({ priceCents }: { priceCents: number | null }) {
  const [down, setDown] = useState(20);
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState(4.9);
  if (priceCents === null || priceCents <= 0) return null;
  const downCents = Math.round(priceCents * down / 100);
  const loan = priceCents - downCents;
  const pay = monthly(loan, rate, years);
  const fees = Math.round(priceCents * FEES_PCT / 100);
  const aid = housingAid(priceCents);
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line/[0.08] sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Calculator className="h-5 w-5 text-brand" />{t('What does it cost per month?')}</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Slider label={t('Down payment')} value={down} shown={`${down}% · ${formatMad(downCents)}`} min={10} max={60} step={5} onChange={setDown} />
          <Slider label={t('Duration')} value={years} shown={t('{n} years', { n: years })} min={5} max={25} step={1} onChange={setYears} />
          <Slider label={t('Interest rate')} value={rate} shown={`${rate.toFixed(1)} %`} min={3} max={7} step={0.1} onChange={setRate} />
        </div>
        <div>
          <div className="rounded-2xl bg-night p-4 text-white">
            <p className="text-sm text-white/75">{t('Monthly payment')}</p>
            <p className="font-display tabular text-3xl font-bold">{formatMad(Math.round(pay / 100) * 100)}<span className="ms-1 text-base font-semibold text-white/75">{t('/ month')}</span></p>
            <p className="mt-1 text-xs text-white/70">{t('Loan of {amount}', { amount: formatMad(loan) })}</p>
          </div>
        </div>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-1.5 border-t border-line/[0.08] pt-4 text-sm sm:grid-cols-2">
        {FEES.map(f => (
          <div key={f.key} className="flex justify-between gap-3"><dt className="text-muted">{t(f.key)} ({f.pct.toLocaleString()}%)</dt><dd className="tabular whitespace-nowrap">{formatMad(Math.round(priceCents * f.pct / 100))}</dd></div>
        ))}
        {aid !== null && <div className="flex justify-between gap-3 text-ok"><dt>{t('Housing aid, if eligible')}</dt><dd className="tabular whitespace-nowrap">−{formatMad(aid)}</dd></div>}
        <div className="flex justify-between gap-3 font-bold sm:col-span-2 sm:mt-1 sm:border-t sm:border-line/[0.08] sm:pt-2"><dt>{t('Needed at the start')}</dt><dd className="tabular whitespace-nowrap">{formatMad(downCents + fees)}</dd></div>
      </dl>
      <p className="mt-4 text-xs text-muted">{t('Indicative estimate. In 2026 banks in Morocco lend at about 4.5 to 5.8% depending on the profile. Your bank decides the real rate.')}</p>
    </section>
  );
}
