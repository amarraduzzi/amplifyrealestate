import { formatMad } from '@vastgoed/shared';
import { supabase } from './supabase';
import { PUBLIC_SITE } from './publicSite';

export type RequestStatus = 'new' | 'accepted' | 'paid_claimed' | 'confirmed' | 'declined' | 'counter' | 'expired' | 'cancelled';
export type StayRequest = {
  id: string; org_id: string; property_id: string; token: string; guest_name: string; guest_phone: string; guests: number; check_in: string; check_out: string;
  arrival_time: string | null; message: string | null; lang: 'fr' | 'en' | 'ar' | 'nl'; nights: number; quote_cents: number; offer_cents: number | null;
  total_cents: number; advance_cents: number; deposit_cents: number; status: RequestStatus; host_note: string | null; hold_until: string | null; stay_id: string | null; created_at: string;
};
export type StayRates = {
  property_id: string; org_id: string; weekend_price_cents: number | null; cleaning_cents: number; deposit_cents: number; advance_pct: number; min_nights: number;
  max_guests: number | null; min_offer_pct: number | null; payment_info: string | null; hold_hours: number; requests_on: boolean;
};

/** Open and recent requests of the office, or null when etappe 12c is not installed. */
export async function loadRequests(orgId: string): Promise<StayRequest[] | null> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const r = await supabase.from('stay_requests').select('*').eq('org_id', orgId).gte('created_at', since).order('created_at', { ascending: false });
  return r.error ? null : (r.data ?? []) as StayRequest[];
}

export const requestUrl = (token: string, lang: string) => `${PUBLIC_SITE}/b/${token}?lang=${lang}`;

export function requestError(m: string): string | null {
  if (m.includes('request_taken')) return 'These dates are no longer free (another booking or an option on the same days).';
  if (m.includes('request_closed')) return 'This request has already been answered.';
  if (m.includes('request_invalid')) return 'Check the dates and the amounts.';
  return null;
}

const day = (d: string, lang: string) => new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA', nl: 'nl-NL' }[lang] ?? 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/** The WhatsApp message to the guest after an answer, in the guest's language. */
export function answerMessage(kind: 'accept' | 'decline' | 'counter' | 'confirm', r: StayRequest, property: string, office: string, holdHours: number): string {
  const first = r.guest_name.trim().split(/\s+/)[0] ?? '';
  const a = day(r.check_in, r.lang), b = day(r.check_out, r.lang);
  const link = requestUrl(r.token, r.lang);
  const adv = formatMad(r.advance_cents), tot = formatMad(r.total_cents);
  const M = {
    fr: {
      accept: `Bonjour ${first}, bonne nouvelle : votre demande pour ${property} du ${a} au ${b} est acceptée (${tot}). Les dates sont gardées pour vous ${holdHours} h. Pour confirmer, payez l'acompte de ${adv} : les détails sont ici ${link}`,
      decline: `Bonjour ${first}, merci pour votre demande pour ${property}. Malheureusement ces dates ne sont pas possibles. N'hésitez pas à choisir d'autres dates : ${link}`,
      counter: `Bonjour ${first}, merci pour votre demande pour ${property}. Je vous propose une autre option, vous pouvez l'accepter ici : ${link}`,
      confirm: `Bonjour ${first}, votre réservation pour ${property} du ${a} au ${b} est confirmée. Merci ! Toutes les infos pour votre arrivée sont ici : ${link}`,
    },
    en: {
      accept: `Hello ${first}, good news: your request for ${property} from ${a} to ${b} is accepted (${tot}). The dates are kept for you for ${holdHours} hours. To confirm, pay the deposit of ${adv}: details here ${link}`,
      decline: `Hello ${first}, thank you for your request for ${property}. Unfortunately these dates are not possible. Feel free to choose other dates: ${link}`,
      counter: `Hello ${first}, thank you for your request for ${property}. I propose another option, you can accept it here: ${link}`,
      confirm: `Hello ${first}, your booking for ${property} from ${a} to ${b} is confirmed. Thank you! Everything for your arrival is here: ${link}`,
    },
    ar: {
      accept: `مرحبا ${first}، خبر سار: طلبكم لـ ${property} من ${a} إلى ${b} مقبول (${tot}). التواريخ محجوزة لكم لمدة ${holdHours} ساعة. للتأكيد، المرجو أداء تسبيق ${adv}: التفاصيل هنا ${link}`,
      decline: `مرحبا ${first}، شكرا على طلبكم لـ ${property}. للأسف هذه التواريخ غير ممكنة. يمكنكم اختيار تواريخ أخرى: ${link}`,
      counter: `مرحبا ${first}، شكرا على طلبكم لـ ${property}. أقترح عليكم خيارا آخر، يمكنكم قبوله هنا: ${link}`,
      confirm: `مرحبا ${first}، حجزكم لـ ${property} من ${a} إلى ${b} مؤكد. شكرا! كل المعلومات الخاصة بوصولكم هنا: ${link}`,
    },
    nl: {
      accept: `Hallo ${first}, goed nieuws: je aanvraag voor ${property} van ${a} tot ${b} is geaccepteerd (${tot}). De data blijven ${holdHours} uur voor je vrij. Betaal het voorschot van ${adv} om te bevestigen: de gegevens staan hier ${link}`,
      decline: `Hallo ${first}, bedankt voor je aanvraag voor ${property}. Helaas kunnen deze data niet. Kies gerust andere data: ${link}`,
      counter: `Hallo ${first}, bedankt voor je aanvraag voor ${property}. Ik stel een andere optie voor, je kunt die hier accepteren: ${link}`,
      confirm: `Hallo ${first}, je boeking voor ${property} van ${a} tot ${b} is bevestigd. Bedankt! Alles voor je aankomst staat hier: ${link}`,
    },
  } as const;
  return `${M[r.lang][kind]}\n— ${office}`;
}

/** Text for a Facebook or Marketplace post, and the automatic first answer for Messenger or WhatsApp Business. */
export function adTexts(o: { title: string; city: string | null; nightCents: number | null; weekendCents: number | null; bedrooms: number | null; link: string; office: string; lang: 'fr' | 'ar' }) {
  const price = o.nightCents ? formatMad(o.nightCents) : '';
  if (o.lang === 'ar') return {
    post: `${o.title}${o.city ? ` · ${o.city}` : ''}\n${o.bedrooms ? `${o.bedrooms} غرف · ` : ''}${price ? `${price} لليلة` : ''}${o.weekendCents ? ` (نهاية الأسبوع ${formatMad(o.weekendCents)})` : ''}\nشوفو التواريخ المتوفرة والثمن مباشرة واحجزو هنا:\n${o.link}\nأو علقو بـ "متوفر" ونرسل ليكم الرابط.`,
    reply: `مرحبا، شكرا على اهتمامكم! هنا تجدون الصور والتواريخ المتوفرة والثمن بالضبط، ويمكنكم الحجز مباشرة: ${o.link}\n— ${o.office}`,
  };
  return {
    post: `${o.title}${o.city ? ` · ${o.city}` : ''}\n${o.bedrooms ? `${o.bedrooms} ch. · ` : ''}${price ? `${price} / nuit` : ''}${o.weekendCents ? ` (week-end ${formatMad(o.weekendCents)})` : ''}\nVoyez les dates libres et le prix exact, et réservez ici :\n${o.link}\nOu commentez « dispo » et je vous envoie le lien.`,
    reply: `Bonjour et merci pour votre message ! Ici vous trouvez les photos, les dates libres et le prix exact, et vous pouvez réserver directement : ${o.link}\n— ${o.office}`,
  };
}
