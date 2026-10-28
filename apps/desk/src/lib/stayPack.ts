import { supabase } from './supabase';
import { PUBLIC_SITE } from './publicSite';
import type { Channel } from './stays';

// Etappe 12b: iCal-import, gastenpagina, schoonmaaklink en berichten aan de gast.

export type GuestLang = 'fr' | 'ar' | 'en' | 'nl';
export const GUEST_LANGS: { id: GuestLang; name: string }[] = [
  { id: 'fr', name: 'Français' }, { id: 'ar', name: 'العربية' }, { id: 'en', name: 'English' }, { id: 'nl', name: 'Nederlands' },
];

export type Feed = {
  id: string; org_id: string; property_id: string; channel: Channel; url: string;
  last_synced_at: string | null; last_status: string | null; last_count: number;
  last_conflicts: { start: string; end: string; name: string }[];
};
export type IcsEvent = { uid: string; start: string; end: string; block: boolean; note: string | null };
export type SyncResult = { new: number; updated: number; cancelled: number; conflicts: { start: string; end: string; name: string }[] };

const BLOCK = /not available|unavailable|closed|blocked|indisponible|bloqu/i;
const ymd = (v: string) => { const m = /(\d{4})(\d{2})(\d{2})/.exec(v); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const plusDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Reads the events of an iCal text (all-day or date-time). Only what is needed: uid, dates, blocked or not, a short note. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.UID && cur.DTSTART) {
        const start = ymd(cur.DTSTART);
        const end = (cur.DTEND && ymd(cur.DTEND)) || (start ? plusDay(start) : null);
        if (start && end && end > start) {
          const desc = (cur.DESCRIPTION ?? '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
          const note = desc.split('\n').filter(l => /reservation url|phone number|https?:\/\//i.test(l)).join(' · ').slice(0, 480) || null;
          out.push({ uid: cur.UID.slice(0, 200), start, end, block: BLOCK.test(cur.SUMMARY ?? ''), note });
        }
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 1) continue;
    const name = line.slice(0, i).split(';')[0].toUpperCase();
    if (name === 'UID' || name === 'DTSTART' || name === 'DTEND' || name === 'SUMMARY' || name === 'DESCRIPTION') cur[name] = line.slice(i + 1).trim();
  }
  return out;
}

/** The worker fetches the calendar of the channel for us (a browser may not read another site directly). */
export async function fetchIcs(url: string): Promise<string> {
  if (!PUBLIC_SITE) throw new Error('no_site');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('no_session');
  const r = await fetch(`${PUBLIC_SITE}/api/ical?url=${encodeURIComponent(url)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return r.text();
}

/** Fetch, read and hand over to the database. Returns the result, or the reason it failed. */
export async function syncFeed(feed: Feed): Promise<{ ok: true; result: SyncResult } | { ok: false; reason: string }> {
  try {
    const text = await fetchIcs(feed.url);
    if (!text.includes('BEGIN:VCALENDAR')) { await supabase.from('ical_feeds').update({ last_status: 'not_calendar' }).eq('id', feed.id); return { ok: false, reason: 'not_calendar' }; }
    const { data, error } = await supabase.rpc('sync_ical_feed', { p_feed: feed.id, p_events: parseIcs(text) });
    if (error) return { ok: false, reason: error.message.includes('42501') || error.message.includes('permission') ? 'permission' : 'database' };
    return { ok: true, result: data as SyncResult };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'error';
    await supabase.from('ical_feeds').update({ last_status: reason.slice(0, 100) }).eq('id', feed.id);
    return { ok: false, reason };
  }
}

export const feedReason = (r: string): string =>
  r === 'no_site' ? 'The address of the public site is not set.'
  : r === 'not_calendar' ? 'This link does not give a calendar. Check that you copied the iCal link.'
  : r === 'permission' ? 'You do not have permission to do this.'
  : r.startsWith('fetch_4') ? 'The channel refused the link. Check that it is correct and still active.'
  : 'The calendar could not be fetched. Try again in a moment.';

export const guideUrl = (token: string, lang: GuestLang) => `${PUBLIC_SITE}/g/${token}?lang=${lang}`;
export const cleanerUrl = (token: string) => `${PUBLIC_SITE}/c/${token}`;

export type GuestMsgKind = 'arrival' | 'instructions' | 'checkout' | 'review';
export const GUEST_MSG_KINDS: GuestMsgKind[] = ['arrival', 'instructions', 'checkout', 'review'];

type V = { name: string; place: string; office: string; link: string | null; inTime: string | null; outTime: string | null };
const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';

const M: Record<GuestLang, Record<GuestMsgKind, (v: V) => string>> = {
  fr: {
    arrival: v => `Bonjour ${first(v.name)}, bienvenue ! Nous sommes ravis de vous accueillir à ${v.place}.${v.inTime ? ` L’arrivée est possible à partir de ${v.inTime}.` : ''}${v.link ? ` Toutes les informations pour votre séjour (accès, wifi, règles, bonnes adresses) sont ici : ${v.link}` : ''} À très bientôt ! ${v.office}`,
    instructions: v => `Bonjour ${first(v.name)}, voici comment arriver et entrer à ${v.place}${v.link ? ` : ${v.link}` : '.'} Dites-moi quand vous êtes en route, quelqu’un vous attendra. ${v.office}`,
    checkout: v => `Bonjour ${first(v.name)}, un petit rappel : le départ est prévu${v.outTime ? ` avant ${v.outTime}` : ' demain'}. Merci de laisser les clés comme convenu et de fermer les fenêtres. Nous espérons que le séjour s’est bien passé ! ${v.office}`,
    review: v => `Bonjour ${first(v.name)}, merci d’avoir séjourné à ${v.place}. Si le séjour vous a plu, un petit avis nous aiderait beaucoup. Et pour votre prochain séjour, écrivez-nous directement sur WhatsApp. ${v.office}`,
  },
  ar: {
    arrival: v => `مرحبا ${first(v.name)}، أهلا وسهلا بكم في ${v.place}.${v.inTime ? ` يمكنكم الوصول ابتداء من ${v.inTime}.` : ''}${v.link ? ` كل المعلومات عن إقامتكم (الدخول، الواي فاي، القواعد، عناوين مفيدة) هنا: ${v.link}` : ''} إلى اللقاء قريبا! ${v.office}`,
    instructions: v => `مرحبا ${first(v.name)}، هذه طريقة الوصول والدخول إلى ${v.place}${v.link ? `: ${v.link}` : '.'} أخبروني عندما تكونون في الطريق وسيكون أحد في انتظاركم. ${v.office}`,
    checkout: v => `مرحبا ${first(v.name)}، تذكير بسيط: موعد المغادرة${v.outTime ? ` قبل ${v.outTime}` : ' غدا'}. المرجو ترك المفاتيح كما اتفقنا وإغلاق النوافذ. نتمنى أن تكون الإقامة قد أعجبتكم! ${v.office}`,
    review: v => `مرحبا ${first(v.name)}، شكرا على إقامتكم في ${v.place}. إذا أعجبتكم الإقامة فتقييم صغير سيساعدنا كثيرا. وفي إقامتكم القادمة راسلونا مباشرة على واتساب. ${v.office}`,
  },
  en: {
    arrival: v => `Hello ${first(v.name)}, welcome! We are happy to host you at ${v.place}.${v.inTime ? ` You can arrive from ${v.inTime}.` : ''}${v.link ? ` Everything for your stay (access, wifi, rules, good addresses) is here: ${v.link}` : ''} See you soon! ${v.office}`,
    instructions: v => `Hello ${first(v.name)}, here is how to get to and into ${v.place}${v.link ? `: ${v.link}` : '.'} Tell me when you are on your way and someone will be waiting for you. ${v.office}`,
    checkout: v => `Hello ${first(v.name)}, a small reminder: check-out is${v.outTime ? ` before ${v.outTime}` : ' tomorrow'}. Please leave the keys as agreed and close the windows. We hope you enjoyed your stay! ${v.office}`,
    review: v => `Hello ${first(v.name)}, thank you for staying at ${v.place}. If you enjoyed it, a short review would help us a lot. For your next stay, write to us directly on WhatsApp. ${v.office}`,
  },
  nl: {
    arrival: v => `Hallo ${first(v.name)}, welkom! We vinden het fijn u te ontvangen bij ${v.place}.${v.inTime ? ` U kunt vanaf ${v.inTime} aankomen.` : ''}${v.link ? ` Alle informatie voor uw verblijf (toegang, wifi, regels, goede adressen) staat hier: ${v.link}` : ''} Tot snel! ${v.office}`,
    instructions: v => `Hallo ${first(v.name)}, zo komt u bij ${v.place} en kunt u naar binnen${v.link ? `: ${v.link}` : '.'} Laat me weten wanneer u onderweg bent, dan staat er iemand klaar. ${v.office}`,
    checkout: v => `Hallo ${first(v.name)}, een kleine herinnering: vertrek is${v.outTime ? ` vóór ${v.outTime}` : ' morgen'}. Laat de sleutels achter zoals afgesproken en sluit de ramen. We hopen dat u een fijn verblijf had! ${v.office}`,
    review: v => `Hallo ${first(v.name)}, bedankt voor uw verblijf bij ${v.place}. Als het u beviel, helpt een korte review ons enorm. Voor uw volgende verblijf kunt u ons rechtstreeks op WhatsApp schrijven. ${v.office}`,
  },
};

export const guestMessage = (kind: GuestMsgKind, lang: GuestLang, v: V) => M[lang][kind](v);
