import { useCallback, useEffect, useState } from 'react';
import { BedDouble, Check, Copy, MessageCircle, RefreshCw, Trash2, Link2, Plug, Brush, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { CHANNELS, channelName, type Channel, type StayProp } from '../lib/stays';
import { cleanerUrl, feedReason, GUEST_LANGS, guideUrl, syncFeed, type Feed, type GuestLang } from '../lib/stayPack';
import { PUBLIC_SITE } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { waLink } from './ContactLinks';
import { Btn, Card, Field, Modal, inputCls } from './ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const when = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const day = (d: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const STALE_MS = 60 * 60 * 1000;

type Guide = { property_id: string; token: string | null; intro: string | null; arrival: string | null; checkin_time: string | null; checkout_time: string | null; wifi_name: string | null; wifi_password: string | null; rules: string | null; tips: string | null };
type Cleaner = { id: string; name: string; phone: string | null; token: string; active: boolean };
type Report = { id: string; property_id: string; note: string | null; photo: string | null; done_at: string };

/** Channel calendars (import), guest pages and cleaning links of the short-term rentals. Only for people who can change things. */
export function StayTools({ office, props, onSynced }: { office: Office; props: StayProp[]; onSynced: () => void }) {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [assign, setAssign] = useState<{ cleaner_id: string; property_id: string }[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [guideFor, setGuideFor] = useState<StayProp | null>(null);
  const [adding, setAdding] = useState<Record<string, { channel: Channel; url: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [newCleaner, setNewCleaner] = useState({ name: '', phone: '' });

  const load = useCallback(async () => {
    const [f, g, c, a, r] = await Promise.all([
      supabase.from('ical_feeds').select('*').eq('org_id', office.id).order('created_at'),
      supabase.from('stay_guides').select('*').eq('org_id', office.id),
      supabase.from('cleaners').select('id, name, phone, token, active').eq('org_id', office.id).order('created_at'),
      supabase.from('cleaner_properties').select('cleaner_id, property_id').eq('org_id', office.id),
      supabase.from('cleaning_reports').select('id, property_id, note, photo, done_at').eq('org_id', office.id).order('done_at', { ascending: false }).limit(8),
    ]);
    setFeeds(f.error ? null : (f.data ?? []) as Feed[]);
    setGuides(g.error ? [] : (g.data ?? []) as Guide[]);
    setCleaners(c.error ? [] : (c.data ?? []) as Cleaner[]);
    setAssign(a.error ? [] : (a.data ?? []) as { cleaner_id: string; property_id: string }[]);
    setReports(r.error ? [] : (r.data ?? []) as Report[]);
    return f.error ? null : (f.data ?? []) as Feed[];
  }, [office.id]);

  // Open the page: calendars that were not read for an hour are read again, so the planning is up to date
  useEffect(() => {
    let live = true;
    (async () => {
      const list = await load();
      if (!list || !PUBLIC_SITE) return;
      const old = list.filter(x => !x.last_synced_at || Date.now() - Date.parse(x.last_synced_at) > STALE_MS);
      if (!old.length) return;
      for (const x of old) { if (!live) return; await syncFeed(x); }
      if (live) { await load(); onSynced(); }
    })();
    return () => { live = false; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (list: Feed[]) => {
    setBusy('sync'); setError(null); setNote(null);
    let nNew = 0, nCancel = 0, failed: string | null = null;
    for (const x of list) {
      const r = await syncFeed(x);
      if (r.ok) { nNew += r.result.new + r.result.updated; nCancel += r.result.cancelled; } else failed = r.reason;
    }
    await load(); onSynced(); setBusy(null);
    if (failed) setError(t(feedReason(failed)));
    else setNote(t('Calendars updated: {n} new or changed, {c} cancelled.', { n: nNew, c: nCancel }));
  };

  const addFeed = async (p: StayProp) => {
    const a = adding[p.id];
    const url = (a?.url ?? '').trim().replace(/^webcal:\/\//i, 'https://');
    if (!/^https:\/\/\S+$/i.test(url)) { setError(t('Paste the iCal link (it starts with https://).')); return; }
    setBusy(p.id); setError(null); setNote(null);
    const ins = await supabase.from('ical_feeds').insert({ org_id: office.id, property_id: p.id, channel: a?.channel ?? 'airbnb', url }).select('*').single();
    if (ins.error) { setBusy(null); setError(ins.error.message.includes('duplicate') ? t('This calendar is already linked.') : planError(ins.error.message)); return; }
    setAdding(x => ({ ...x, [p.id]: { channel: a?.channel ?? 'airbnb', url: '' } }));
    const r = await syncFeed(ins.data as Feed);
    await load(); onSynced(); setBusy(null);
    if (!r.ok) setError(t(feedReason(r.reason)));
    else setNote(t('Calendar linked: {n} bookings found.', { n: r.result.new }));
  };

  const removeFeed = async (x: Feed) => {
    if (!window.confirm(t('Remove this calendar? The bookings that came from it are cancelled here.'))) return;
    setBusy(x.id); setError(null);
    const r = await supabase.from('ical_feeds').delete().eq('id', x.id);
    await load(); onSynced(); setBusy(null);
    if (r.error) setError(planError(r.error.message));
  };

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1600); } catch { /* no clipboard */ }
  };

  const addCleaner = async () => {
    if (!newCleaner.name.trim()) { setError(t('Enter a name.')); return; }
    setBusy('cleaner'); setError(null);
    const r = await supabase.from('cleaners').insert({ org_id: office.id, name: newCleaner.name.trim(), phone: newCleaner.phone.trim() || null });
    setBusy(null);
    if (r.error) { setError(planError(r.error.message)); return; }
    setNewCleaner({ name: '', phone: '' }); load();
  };
  const toggleProp = async (c: Cleaner, propertyId: string, on: boolean) => {
    setError(null);
    const r = on
      ? await supabase.from('cleaner_properties').insert({ cleaner_id: c.id, property_id: propertyId, org_id: office.id })
      : await supabase.from('cleaner_properties').delete().eq('cleaner_id', c.id).eq('property_id', propertyId);
    if (r.error) setError(planError(r.error.message)); else load();
  };
  const setActive = async (c: Cleaner, active: boolean) => {
    const r = await supabase.from('cleaners').update({ active }).eq('id', c.id);
    if (r.error) setError(planError(r.error.message)); else load();
  };
  const sendCleaner = (c: Cleaner) => {
    const text = t('Hello {name}, here is your cleaning list. Open it, and tap “Done” after each cleaning (a photo is welcome): {url}', { name: c.name.split(' ')[0], url: cleanerUrl(c.token) });
    window.open(c.phone ? `${waLink(c.phone)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  if (!PUBLIC_SITE) return null;
  const propName = (id: string) => props.find(p => p.id === id)?.title ?? '';

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h2 className="font-display flex items-center gap-2 text-xl font-bold"><Plug className="h-5 w-5 text-brand" /> {t('Connect and automate')}</h2>
        <p className="text-sm text-muted">{t('Link your Airbnb and Booking calendars so double bookings cannot happen, give guests a page with everything they need, and let your cleaner work without an account.')}</p>
      </div>
      {note && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{note}</p>}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-brand" /> {t('Airbnb and Booking calendars')}</h3>
          {feeds && feeds.length > 0 && <Btn onClick={() => sync(feeds)} disabled={busy === 'sync'}><RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} /> {t('Update now')}</Btn>}
        </div>
        <p className="mt-1 text-sm text-muted">{t('In Airbnb or Booking, copy the iCal link (“Export calendar”) and paste it here. Bookings appear in your planning, and dates that are already taken cannot be booked twice.')}</p>
        {feeds === null && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 12b first.')}</p>}
        {feeds && (
          <div className="mt-3 space-y-3">
            {props.map(p => {
              const mine = feeds.filter(f => f.property_id === p.id);
              const a = adding[p.id] ?? { channel: 'airbnb' as Channel, url: '' };
              return (
                <div key={p.id} className="rounded-2xl bg-surface-2 p-3">
                  <p className="flex items-center gap-2 font-semibold"><BedDouble className="h-4 w-4 text-muted" /> {p.title}</p>
                  {mine.map(f => (
                    <div key={f.id} className="mt-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-bg">{channelName(f.channel, t('Other'))}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted" dir="ltr">{f.url}</span>
                        <button type="button" onClick={() => removeFeed(f)} aria-label={t('Remove')} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {f.last_synced_at ? t('Last update {date}', { date: when(f.last_synced_at) }) : t('Not read yet')}
                        {f.last_status && f.last_status !== 'ok' ? ` · ${t(feedReason(f.last_status))}` : ''}
                      </p>
                      {f.last_conflicts.length > 0 && (
                        <ul className="mt-1 space-y-0.5 rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                          {f.last_conflicts.map((c, i) => <li key={i}>{t('Double booking: {name} from {a} to {b} overlaps another booking.', { name: c.name, a: day(c.start), b: day(c.end) })}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select className={`${inputCls} !w-auto`} value={a.channel} aria-label={t('Channel')} onChange={e => setAdding(x => ({ ...x, [p.id]: { ...a, channel: e.target.value as Channel } }))}>
                      {CHANNELS.filter(c => c !== 'direct').map(c => <option key={c} value={c}>{channelName(c, t('Other'))}</option>)}
                    </select>
                    <input className={`${inputCls} min-w-0 flex-1`} dir="ltr" placeholder="https://…ics" value={a.url} aria-label={t('iCal link')} onChange={e => setAdding(x => ({ ...x, [p.id]: { ...a, url: e.target.value } }))} />
                    <Btn tone="brand" onClick={() => addFeed(p)} disabled={busy === p.id || !a.url.trim()}>{t('Add')}</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-display flex items-center gap-2 text-lg font-bold"><Link2 className="h-5 w-5 text-brand" /> {t('Guest page')}</h3>
        <p className="mt-1 text-sm text-muted">{t('One private page per property for your guests: arrival, wifi, rules and good addresses, in French, Arabic, English or Dutch. Send the link on WhatsApp.')}</p>
        <ul className="mt-3 divide-y divide-line/[0.07]">
          {props.map(p => {
            const g = guides.find(x => x.property_id === p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate font-semibold">{p.title}</span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g?.token ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-muted'}`}>{g?.token ? t('Online') : t('Off')}</span>
                  <Btn onClick={() => setGuideFor(p)}>{t('Edit')}</Btn>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h3 className="font-display flex items-center gap-2 text-lg font-bold"><Brush className="h-5 w-5 text-brand" /> {t('Cleaning')}</h3>
        <p className="mt-1 text-sm text-muted">{t('Your cleaner gets a link with only the cleanings of their properties, and marks each one as done with a photo. No account needed.')}</p>
        <div className="mt-3 space-y-3">
          {cleaners.map(c => (
            <div key={c.id} className={`rounded-2xl bg-surface-2 p-3 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{c.name}{c.phone ? <span className="ms-2 text-xs font-normal text-muted" dir="ltr">{c.phone}</span> : null}</p>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => copy(`c:${c.id}`, cleanerUrl(c.token))} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    {copied === `c:${c.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === `c:${c.id}` ? t('Copied') : t('Copy link')}
                  </button>
                  <Btn tone="ghost" onClick={() => sendCleaner(c)} disabled={!c.active}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')}</Btn>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {props.map(p => {
                  const on = assign.some(a => a.cleaner_id === c.id && a.property_id === p.id);
                  return (
                    <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleProp(c, p.id, !on)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{p.title}</button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setActive(c, !c.active)} className="mt-2 text-xs font-semibold text-muted hover:text-ink">{c.active ? t('Stop this link') : t('Turn this link on again')}</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} min-w-0 flex-1`} placeholder={t('Name of the cleaner')} value={newCleaner.name} maxLength={100} onChange={e => setNewCleaner(x => ({ ...x, name: e.target.value }))} />
            <input className={`${inputCls} min-w-0 flex-1`} dir="ltr" placeholder={t('WhatsApp number')} value={newCleaner.phone} maxLength={40} onChange={e => setNewCleaner(x => ({ ...x, phone: e.target.value }))} />
            <Btn tone="brand" onClick={addCleaner} disabled={busy === 'cleaner'}>{t('Add')}</Btn>
          </div>
        </div>
        {reports.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">{t('Recently cleaned')}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {reports.map(r => (
                <li key={r.id} className="flex gap-3 rounded-2xl bg-surface-2 p-2.5 text-sm">
                  {r.photo ? <img src={`data:image/jpeg;base64,${r.photo}`} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-surface text-muted"><Check className="h-5 w-5" /></span>}
                  <span className="min-w-0"><span className="block truncate font-semibold">{propName(r.property_id)}</span><span className="block text-xs text-muted">{when(r.done_at)}</span>{r.note && <span className="mt-0.5 block text-xs">{r.note}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {guideFor && <GuideEditor office={office} property={guideFor} guide={guides.find(g => g.property_id === guideFor.id) ?? null} onClose={() => setGuideFor(null)} onSaved={() => { load(); }} />}
    </div>
  );
}

function GuideEditor({ office, property, guide, onClose, onSaved }: { office: Office; property: StayProp; guide: Guide | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    intro: guide?.intro ?? '', arrival: guide?.arrival ?? '', checkin: guide?.checkin_time ?? '', checkout: guide?.checkout_time ?? '',
    wifiName: guide?.wifi_name ?? '', wifiPass: guide?.wifi_password ?? '', rules: guide?.rules ?? '', tips: guide?.tips ?? '',
  });
  const [token, setToken] = useState<string | null>(guide?.token ?? null);
  const [lang, setLang] = useState<GuestLang>('fr');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => { setSaved(false); setF(x => ({ ...x, ...p })); };

  const save = async (): Promise<boolean> => {
    setBusy(true); setError(null);
    const row = {
      intro: f.intro.trim() || null, arrival: f.arrival.trim() || null, checkin_time: f.checkin.trim() || null, checkout_time: f.checkout.trim() || null,
      wifi_name: f.wifiName.trim() || null, wifi_password: f.wifiPass.trim() || null, rules: f.rules.trim() || null, tips: f.tips.trim() || null,
    };
    const have = await supabase.from('stay_guides').select('property_id').eq('property_id', property.id).maybeSingle();
    const r = have.data
      ? await supabase.from('stay_guides').update(row).eq('property_id', property.id).select('property_id')
      : await supabase.from('stay_guides').insert({ property_id: property.id, org_id: office.id, ...row }).select('property_id');
    setBusy(false);
    if (r.error) { setError(planError(r.error.message)); return false; }
    setSaved(true); onSaved(); return true;
  };
  const link = async (on: boolean) => {
    if (on && !(await save())) return;
    if (!on && !window.confirm(t('Turn the guest page off? The current link stops working.'))) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('set_guide_link', { p_property: property.id, p_on: on });
    setBusy(false);
    if (error) { setError(planError(error.message)); return; }
    setToken((data as string | null) ?? null); onSaved();
  };
  const url = token ? guideUrl(token, lang) : '';
  const send = () => {
    const text = t('Welcome! Everything for your stay at {place}: {url}', { place: property.title, url });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <Modal title={`${t('Guest page')} · ${property.title}`} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2"><Btn onClick={onClose}>{t('Close')}</Btn><Btn tone="brand" onClick={save} disabled={busy}>{saved ? t('Saved') : t('Save')}</Btn></div>}>
      <div className="space-y-4">
        <Field label={t('Welcome message')} hint={t('A few warm lines for the guest.')}><textarea className={inputCls} rows={2} maxLength={1500} value={f.intro} onChange={e => set({ intro: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Check-in from')}><input className={inputCls} dir="ltr" placeholder="15:00" maxLength={20} value={f.checkin} onChange={e => set({ checkin: e.target.value })} /></Field>
          <Field label={t('Check-out before')}><input className={inputCls} dir="ltr" placeholder="11:00" maxLength={20} value={f.checkout} onChange={e => set({ checkout: e.target.value })} /></Field>
        </div>
        <Field label={t('How to arrive and get in')} hint={t('Exact address, floor, door code or key handover. The page is private: only people with the link see it.')}><textarea className={inputCls} rows={4} maxLength={2000} value={f.arrival} onChange={e => set({ arrival: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Wifi name')}><input className={inputCls} dir="ltr" maxLength={80} value={f.wifiName} onChange={e => set({ wifiName: e.target.value })} /></Field>
          <Field label={t('Wifi password')}><input className={inputCls} dir="ltr" maxLength={80} value={f.wifiPass} onChange={e => set({ wifiPass: e.target.value })} /></Field>
        </div>
        <Field label={t('House rules')}><textarea className={inputCls} rows={3} maxLength={2000} value={f.rules} onChange={e => set({ rules: e.target.value })} /></Field>
        <Field label={t('Good addresses nearby')} hint={t('Bakery, pharmacy, restaurants, taxi.')}><textarea className={inputCls} rows={3} maxLength={2000} value={f.tips} onChange={e => set({ tips: e.target.value })} /></Field>

        <div className="rounded-2xl bg-surface-2 p-3">
          {!token ? (
            <Btn tone="brand" onClick={() => link(true)} disabled={busy}><Link2 className="h-4 w-4" /> {t('Create the guest link')}</Btn>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Language')}>
                {GUEST_LANGS.map(l => (
                  <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setLang(l.id)} lang={l.id}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${lang === l.id ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10'}`}>{l.name}</button>
                ))}
              </div>
              <p className="break-all text-xs text-muted" dir="ltr">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
                <Btn tone="ghost" onClick={send}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')}</Btn>
                <Btn tone="ghost" onClick={() => { if (window.confirm(t('Make a new link? The old link stops working.'))) link(true); }} disabled={busy}>{t('New link')}</Btn>
                <Btn tone="danger" onClick={() => link(false)} disabled={busy}>{t('Turn off')}</Btn>
              </div>
            </div>
          )}
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
