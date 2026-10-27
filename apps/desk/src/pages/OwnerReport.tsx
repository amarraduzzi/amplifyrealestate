import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { loadViewings, type ViewingView } from '../lib/viewings';
import { loadDeals, type DealView } from '../lib/deals';
import { basisLabel, dealStageLabel, outcomeLabel, priceSuffix, purposeLabel, statusLabel, typeLabel, viewingStatusLabel } from '../lib/labels';
import { whenText } from '../lib/dates';
import { Btn } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;
const fmt = (d: string | Date, style: 'medium' | 'long', utc = false) =>
  new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: style, ...(utc ? { timeZone: 'UTC' } : {}) }).format(typeof d === 'string' ? new Date(d) : d);

type Mandate = { id: string; owner_person_id: string | null; basis: any; status: string; valid_from: string | null; valid_until: string | null };

/**
 * A one-page report for the owner of a property: the property, the mandate, the viewings and the offers.
 * Printed or saved as PDF with the browser (see the print rules in index.css). Names and contacts of the
 * interested people, and the commission, are left out on purpose: the owner gets the activity, not the files.
 */
export function OwnerReport({ office, property, onClose }: { office: Office; property: PropertyRow; onClose: () => void }) {
  const [data, setData] = useState<{ viewings: ViewingView[]; deals: DealView[]; mandate: Mandate | null; owner: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [viewings, deals, m] = await Promise.all([
          loadViewings(office.id, { propertyId: property.id }),
          loadDeals(office.id, { propertyId: property.id }),
          supabase.from('property_mandates').select('id, owner_person_id, basis, status, valid_from, valid_until').eq('property_id', property.id),
        ]);
        if (m.error) throw new Error(m.error.message);
        const today = new Date().toISOString().slice(0, 10);
        const active = ((m.data ?? []) as Mandate[]).filter(x => x.status === 'active' && (!x.valid_until || x.valid_until >= today))
          .sort((a, b) => (b.valid_until ?? '9999').localeCompare(a.valid_until ?? '9999'))[0] ?? null;
        let owner: string | null = null;
        if (active?.owner_person_id) {
          const p = await supabase.from('people').select('full_name').eq('id', active.owner_person_id).maybeSingle();
          owner = (p.data as { full_name: string } | null)?.full_name ?? null;
        }
        if (live) setData({ viewings: viewings.sort((a, b) => b.v.scheduled_at.localeCompare(a.v.scheduled_at)), deals, mandate: active, owner });
      } catch (e) { if (live) setError(e instanceof Error ? e.message : t('Something went wrong.')); }
    })();
    return () => { live = false; };
  }, [office.id, property.id]);

  const place = [property.neighborhood, property.city].filter(Boolean).join(', ');
  const v = data?.viewings ?? [];
  const held = v.filter(x => x.v.status === 'done').length;
  const planned = v.filter(x => x.v.status === 'scheduled').length;
  const interested = v.filter(x => x.v.outcome === 'interested' || x.v.outcome === 'offer_made').length;
  const Tile = ({ n, label }: { n: number; label: string }) => (
    <div className="rounded-xl border border-black/10 px-3 py-2 text-center"><p className="tabular text-2xl font-bold">{n}</p><p className="text-xs">{label}</p></div>
  );
  const H = ({ children }: { children: string }) => <h3 className="mb-2 mt-6 border-b border-black/15 pb-1 text-sm font-bold uppercase tracking-wide">{children}</h3>;

  return createPortal((
    <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-2xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8">
        <div className="no-print mb-4 flex items-center justify-between gap-2">
          <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
          <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide">{office.name}</p>
        <h2 className="font-display text-2xl font-bold">{t('Owner report')}</h2>
        <p className="text-xs">{t('Prepared on {date}', { date: fmt(new Date(), 'long') })}</p>

        <H>{t('Property')}</H>
        <p className="text-lg font-bold">{property.title}</p>
        <p className="text-sm">{[property.reference, typeLabel(property.property_type), purposeLabel(property.purpose), statusLabel(property.status)].join(' · ')}</p>
        <p className="mt-1 text-xl font-bold">{formatMad(property.price_cents)} <span className="text-sm font-normal">{priceSuffix(property.purpose)}</span></p>
        <p className="text-sm">{[place, property.bedrooms !== null ? `${property.bedrooms} ${t('Bedrooms')}` : null, property.bathrooms !== null ? `${property.bathrooms} ${t('Bathrooms')}` : null, property.area_m2 !== null ? `${Number(property.area_m2)} m²` : null].filter(Boolean).join(' · ')}</p>
        {property.info_confirmed_at && <p className="mt-1 text-xs">{t('Price and availability confirmed')}: {fmt(property.info_confirmed_at, 'medium')}</p>}
        <p className="mt-1 text-xs">{t('Public page')}: {property.is_published ? t('Online') : t('Offline')}</p>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        {!data && !error && <p className="mt-4 text-sm">…</p>}
        {data && (<>
          <H>{t('Mandate')}</H>
          {data.mandate ? (
            <p className="text-sm">
              {[data.owner ? `${t('Owner')}: ${data.owner}` : null, basisLabel(data.mandate.basis),
                data.mandate.valid_until ? `${t('Valid until')} ${fmt(data.mandate.valid_until, 'medium', true)}` : null].filter(Boolean).join(' · ')}
            </p>
          ) : <p className="text-sm">{t('No active mandate.')}</p>}

          <H>{t('Activity')}</H>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile n={held} label={t('Viewings held')} />
            <Tile n={planned} label={t('Viewings planned')} />
            <Tile n={interested} label={t('Interested')} />
            <Tile n={data.deals.length} label={t('Offers')} />
          </div>

          <H>{t('Viewings')}</H>
          {v.length === 0 ? <p className="text-sm">{t('No viewings yet.')}</p> : (
            <ul className="divide-y divide-black/10 text-sm">
              {v.map(({ v: x }) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span className="tabular">{whenText(x.scheduled_at)}</span>
                  <span>{[viewingStatusLabel(x.status), x.outcome ? outcomeLabel(x.outcome) : null].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}

          <H>{t('Offers')}</H>
          {data.deals.length === 0 ? <p className="text-sm">{t('No offers yet.')}</p> : (
            <ul className="divide-y divide-black/10 text-sm">
              {data.deals.map(({ d }) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span className="tabular">{fmt(d.created_at, 'medium')}</span>
                  <span>{formatMad(d.price_cents)} · {dealStageLabel(d.stage)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-xs opacity-70">{t('Names and contacts of interested people are not shown in this report.')}</p>
        </>)}
      </div>
    </div>
  ), document.body);
}
