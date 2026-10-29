import { useCallback, useEffect, useState } from 'react';
import { Calculator, MessageCircle, Phone } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { typeLabel } from '../lib/labels';
import { friendly } from '../lib/errors';

type Row = {
  id: string; purpose: 'sale' | 'rent_long' | 'rent_short'; property_type: string; neighborhood: string | null; area_m2: number | null; bedrooms: number | null;
  condition: string | null; message: string | null; low_cents: number | null; high_cents: number | null; status: 'new' | 'contacted' | 'mandate' | 'lost'; created_at: string;
  people: { full_name: string; phone: string | null; whatsapp: string | null } | null;
};
const STATUSES = ['new', 'contacted', 'mandate', 'lost'] as const;
const statusLabel = (s: Row['status']) => t(({ new: 'New', contacted: 'Contacted', mandate: 'Mandate signed', lost: 'Not interested' } as const)[s]);
const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const wa = (raw: string) => { let d = raw.replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = `212${d.slice(1)}`; return `https://wa.me/${d}`; };

/** Owners who asked "how much is my property worth?" on the website: future mandates. */
export function EstimationRequests({ office }: { office: Office }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const canWrite = office.role !== 'viewer';
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('estimation_requests')
      .select('id, purpose, property_type, neighborhood, area_m2, bedrooms, condition, message, low_cents, high_cents, status, created_at, people(full_name, phone, whatsapp)')
      .eq('org_id', office.id).order('created_at', { ascending: false }).limit(50);
    if (error) { setRows([]); return; } // before the SQL update: nothing to show
    setRows((data ?? []).map((r: any) => ({ ...r, people: Array.isArray(r.people) ? r.people[0] : r.people })) as Row[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);
  if (!rows || rows.length === 0) return null;

  const setStatus = async (r: Row, status: Row['status']) => {
    const { error } = await supabase.from('estimation_requests').update({ status }).eq('id', r.id);
    if (error) setError(friendly(error)); else setRows(x => (x ?? []).map(y => (y.id === r.id ? { ...y, status } : y)));
  };
  const open = rows.filter(r => r.status === 'new' || r.status === 'contacted');
  const list = all ? rows : open;
  const day = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <section className="mt-6 rounded-3xl bg-surface p-4 ring-1 ring-line/[0.08] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Calculator className="h-5 w-5 text-brand" />{t('Owners who want an estimate')}
          {open.length > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{open.length}</span>}</h2>
        <button type="button" onClick={() => setAll(x => !x)} className="text-sm font-semibold text-muted hover:text-ink">{all ? t('Only open requests') : t('Show all')}</button>
      </div>
      <p className="text-sm text-muted">{t('From “How much is my property worth?” on your website. Call them back: these are your next mandates.')}</p>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {list.length === 0 && <p className="mt-3 text-sm text-muted">{t('No open requests.')}</p>}
      <ul className="mt-3 space-y-2">
        {list.map(r => {
          const phone = r.people?.whatsapp || r.people?.phone || null;
          return (
            <li key={r.id} className="rounded-2xl bg-surface-2 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.people?.full_name ?? '…'} <span className="font-normal text-muted">· {r.purpose === 'sale' ? t('wants to sell') : t('wants to rent out')} · {day(r.created_at)}</span></p>
                  <p className="text-sm text-muted">{[typeLabel(r.property_type as never), r.neighborhood, r.area_m2 ? `${Number(r.area_m2)} m²` : null, r.bedrooms ? t('{n} bedrooms', { n: r.bedrooms }) : null].filter(Boolean).join(' · ')}</p>
                  {r.low_cents && r.high_cents && <p className="mt-0.5 text-sm font-semibold">{t('Range shown')}: {formatMad(r.low_cents)} – {formatMad(r.high_cents)}</p>}
                  {r.message && <p className="mt-1 text-sm">{r.message}</p>}
                </div>
                <div className="flex gap-1.5">
                  {phone && <a href={wa(phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid h-9 w-9 place-items-center rounded-xl bg-ok/10 text-ok"><MessageCircle className="h-4 w-4" /></a>}
                  {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} aria-label={t('Call')} className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted hover:text-ink"><Phone className="h-4 w-4" /></a>}
                </div>
              </div>
              {canWrite && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s} type="button" aria-pressed={r.status === s} onClick={() => setStatus(r, s)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${r.status === s ? 'bg-ink text-bg' : 'bg-surface text-muted hover:text-ink'}`}>{statusLabel(s)}</button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
