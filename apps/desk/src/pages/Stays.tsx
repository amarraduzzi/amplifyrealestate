import { useCallback, useEffect, useMemo, useState } from 'react';
import { BedDouble, CalendarPlus, Check, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { channelCls, channelName, iso, loadStayProps, loadStays, nights, type Stay, type StayProp } from '../lib/stays';
import { PUBLIC_SITE } from '../lib/publicSite';
import { Btn, Card } from '../components/ui';
import { StayForm } from './StayForm';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

/** Short-term rental: a month calendar per property, with occupancy and revenue. */
export function Stays({ office }: { office: Office }) {
  const canWrite = office.role !== 'viewer';
  const [props, setProps] = useState<StayProp[] | null | undefined>(undefined);
  const [stays, setStays] = useState<Stay[]>([]);
  const [month, setMonth] = useState(monthStart());
  const [form, setForm] = useState<{ stay?: Stay; propertyId?: string; checkIn?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from = iso(month), to = iso(addMonths(month, 1));
  const load = useCallback(async () => {
    const p = await loadStayProps(office.id);
    setProps(p);
    if (p) setStays(await loadStays(office.id, from, to));
  }, [office.id, from, to]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const n = nights(from, to);
    return Array.from({ length: n }, (_, i) => iso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1))));
  }, [from, to, month]);
  const today = iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const label = new Intl.DateTimeFormat(LOCALES[getLang()], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);

  const stats = useMemo(() => {
    const per = new Map<string, { nights: number; revenue: number }>();
    for (const s of stays) {
      if (s.status !== 'confirmed') continue;
      const a = s.check_in < from ? from : s.check_in, b = s.check_out > to ? to : s.check_out;
      const x = per.get(s.property_id) ?? { nights: 0, revenue: 0 };
      x.nights += Math.max(0, nights(a, b));
      if (s.check_in >= from && s.check_in < to) x.revenue += s.total_cents - s.channel_fee_cents;
      per.set(s.property_id, x);
    }
    return per;
  }, [stays, from, to]);
  const totalNights = [...stats.values()].reduce((n, x) => n + x.nights, 0);
  const totalRevenue = [...stats.values()].reduce((n, x) => n + x.revenue, 0);
  const occupancy = props && props.length ? Math.round((totalNights / (props.length * days.length)) * 100) : 0;

  const icalLink = async (p: StayProp) => {
    setError(null);
    let token = p.ical_token;
    if (!token) {
      const { data, error } = await supabase.rpc('renew_ical_token', { p_property: p.id });
      if (error) { setError(t('You do not have permission to do this.')); return; }
      token = data as string; load();
    }
    try { await navigator.clipboard.writeText(`${PUBLIC_SITE}/ical/${token}.ics`); setCopied(p.id); window.setTimeout(() => setCopied(null), 1800); } catch { /* no clipboard */ }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Short stays')}</h1>
          <p className="text-sm text-muted">{t('Bookings, occupancy and revenue of your short-term rentals.')}</p>
        </div>
        {canWrite && props && props.length > 0 && <Btn tone="brand" onClick={() => setForm({})}><CalendarPlus className="h-4 w-4" /> {t('New booking')}</Btn>}
      </div>

      {props === undefined && <p className="mt-10 text-center text-muted">…</p>}
      {props === null && <p className="mt-6 rounded-xl bg-warn/10 px-3 py-2 text-sm font-semibold text-warn">{t('Run the SQL of etappe 7e first.')}</p>}
      {props && props.length === 0 && (
        <Card className="mt-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><BedDouble className="h-6 w-6" /></span>
          <h2 className="font-display mt-3 text-xl font-bold">{t('No short-term rentals yet')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('Give a property the purpose "Short-term rent" and it appears here with its calendar.')}</p>
        </Card>
      )}

      {props && props.length > 0 && (<>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label={t('Previous month')} className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
          <button type="button" onClick={() => setMonth(monthStart())} className="rounded-full bg-surface px-3.5 py-1.5 text-sm font-semibold capitalize ring-1 ring-line/10">{label}</button>
          <button type="button" onClick={() => setMonth(m => addMonths(m, 1))} aria-label={t('Next month')} className="grid h-9 w-9 place-items-center rounded-full bg-surface ring-1 ring-line/10 hover:text-brand"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Card><p className="text-xs text-muted sm:text-sm">{t('Occupancy')}</p><p className="font-display tabular mt-1 text-xl font-bold sm:text-2xl">{occupancy}%</p></Card>
          <Card><p className="text-xs text-muted sm:text-sm">{t('Nights booked')}</p><p className="font-display tabular mt-1 text-xl font-bold sm:text-2xl">{totalNights}</p></Card>
          <Card><p className="text-xs text-muted sm:text-sm">{t('Net revenue')}</p><p className="font-display tabular mt-1 text-xl font-bold text-ok sm:text-2xl">{formatMad(totalRevenue)}</p></Card>
        </div>

        <div className="mt-5 space-y-3">
          {props.map(p => {
            const ps = stays.filter(s => s.property_id === p.id && s.status === 'confirmed');
            const st = stats.get(p.id) ?? { nights: 0, revenue: 0 };
            return (
              <section key={p.id} className="card rounded-2xl p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold">{p.title} <span className="tabular text-xs font-normal text-muted">· {p.reference}</span></p>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    <span className="tabular">{Math.round((st.nights / days.length) * 100)}% · {formatMad(st.revenue)}</span>
                    {PUBLIC_SITE && canWrite && (
                      <button type="button" onClick={() => icalLink(p)} title={t('Copy the iCal link for Airbnb or Booking')} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                        {copied === p.id ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {copied === p.id ? t('Copied') : 'iCal'}
                      </button>
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto pb-1" dir="ltr">
                  <div className="grid min-w-[42rem] gap-y-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                    {days.map((d, i) => (
                      <div key={d} style={{ gridRow: 1, gridColumn: i + 1 }} className={`text-center text-[10px] font-semibold ${d === today ? 'text-brand' : 'text-muted'}`}>{Number(d.slice(8))}</div>
                    ))}
                    {days.map((d, i) => (
                      <button key={d} type="button" disabled={!canWrite} onClick={() => setForm({ propertyId: p.id, checkIn: d })} aria-label={d}
                        style={{ gridRow: 2, gridColumn: i + 1 }} className={`h-9 border-s border-line/[0.07] transition hover:bg-brand/10 disabled:hover:bg-transparent ${d === today ? 'bg-brand/5' : ''} ${d < today ? 'opacity-60' : ''}`} />
                    ))}
                    {ps.map(s => {
                      const a = s.check_in < from ? 0 : nights(from, s.check_in);
                      const b = s.check_out > to ? days.length : nights(from, s.check_out);
                      return (
                        <button key={s.id} type="button" onClick={() => setForm({ stay: s })} title={`${s.guest_name} · ${channelName(s.channel, t('Other'))}`}
                          style={{ gridRow: 2, gridColumn: `${a + 1} / ${b + 1}` }}
                          className={`z-10 mx-px my-0.5 truncate rounded-lg px-1.5 text-start text-[11px] font-bold leading-8 shadow-sm ${channelCls[s.channel]}`}>
                          {s.guest_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(['direct', 'airbnb', 'booking', 'other'] as const).map(c => <span key={c} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${channelCls[c]}`} />{channelName(c, t('Other'))}</span>)}
          <span>{t('Tap a free day to add a booking.')}</span>
        </p>
        {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      </>)}

      {form && props && (
        <StayForm office={office} props={props} stay={form.stay} defaults={{ propertyId: form.propertyId, checkIn: form.checkIn }}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      )}
    </div>
  );
}
