import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { loadViewings, type ViewingView } from '../lib/viewings';
import { loadDeals, type DealView } from '../lib/deals';
import { basisLabel, dealStageLabel, outcomeLabel, priceSuffix, purposeLabel, statusLabel, typeLabel, viewingStatusLabel } from '../lib/labels';
import { whenText, todayStr } from '../lib/dates';
import { loadLeases, type LeaseView } from '../lib/leases';
import { loadPaymentsSince, type PaymentRow } from '../lib/payments';
import { costByLabel, loadMaintenance, maintStatusLabel, type MaintView } from '../lib/maintenance';
import { computeFinance, periodStart } from '../lib/ownerFinance';
import { Btn } from '../components/ui';
import { waLink } from '../components/ContactLinks';
import { PUBLIC_SITE, propertyUrl, whatsappShareUrl } from '../lib/publicSite';
import { friendly } from '../lib/errors';

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
  const [data, setData] = useState<{ viewings: ViewingView[]; deals: DealView[]; lease: LeaseView | null; payments: PaymentRow[]; repairs: MaintView[]; mandate: Mandate | null; owner: { name: string; number: string | null } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // The rental tables come with etappe 3: without them these parts stay empty.
        const [viewings, deals, m, leases, repairs] = await Promise.all([
          loadViewings(office.id, { propertyId: property.id }),
          loadDeals(office.id, { propertyId: property.id }),
          supabase.from('property_mandates').select('id, owner_person_id, basis, status, valid_from, valid_until').eq('property_id', property.id),
          loadLeases(office.id, { propertyId: property.id }).catch(() => [] as LeaseView[]),
          loadMaintenance(office.id, { propertyId: property.id }).catch(() => [] as MaintView[]),
        ]);
        const lease = leases.find(x => x.l.status === 'active') ?? leases[0] ?? null;
        const payments = await loadPaymentsSince(leases.map(x => x.l.id), periodStart(todayStr()));
        if (m.error) throw new Error(m.error.message);
        const today = new Date().toISOString().slice(0, 10);
        const active = ((m.data ?? []) as Mandate[]).filter(x => x.status === 'active' && (!x.valid_until || x.valid_until >= today))
          .sort((a, b) => (b.valid_until ?? '9999').localeCompare(a.valid_until ?? '9999'))[0] ?? null;
        let owner: { name: string; number: string | null } | null = null;
        if (active?.owner_person_id) {
          const p = await supabase.from('people').select('full_name, phone, whatsapp').eq('id', active.owner_person_id).maybeSingle();
          const r = p.data as { full_name: string; phone: string | null; whatsapp: string | null } | null;
          owner = r ? { name: r.full_name, number: r.whatsapp || r.phone } : null;
        }
        if (live) setData({ viewings: viewings.sort((a, b) => b.v.scheduled_at.localeCompare(a.v.scheduled_at)), deals, lease, payments, repairs, mandate: active, owner });
      } catch (e) { if (live) setError(friendly(e)); }
    })();
    return () => { live = false; };
  }, [office.id, property.id]);

  const place = [property.neighborhood, property.city].filter(Boolean).join(', ');
  const v = data?.viewings ?? [];
  const held = v.filter(x => x.v.status === 'done').length;
  const planned = v.filter(x => x.v.status === 'scheduled').length;
  const interested = v.filter(x => x.v.outcome === 'interested' || x.v.outcome === 'offer_made').length;
  const fin = data ? computeFinance(data.payments, data.repairs.map(x => x.m), todayStr()) : null;
  const send = () => {
    if (!data) return;
    const vars = { name: data.owner?.name ?? '', title: property.title, reference: property.reference, held, planned, interested, offers: data.deals.length };
    let text = t(data.owner ? 'Hello {name}, here is the update on {title} ({reference}): {held} viewings held, {planned} planned, {interested} interested, {offers} offers.' : 'Hello, here is the update on {title} ({reference}): {held} viewings held, {planned} planned, {interested} interested, {offers} offers.', vars);
    if (property.is_published && PUBLIC_SITE) text += `\n${propertyUrl(office.slug, property.reference, getLang())}`;
    if (fin && data.lease) text += `\n${t('Rent in the last 12 months: collected {collected}, outstanding {outstanding}.', { collected: formatMad(fin.collected), outstanding: formatMad(fin.outstanding) })}`;
    if (fin && fin.repairCosts > 0) text += `\n${t('Repair costs in the last 12 months: {amount}.', { amount: formatMad(fin.repairCosts) })}`;
    text += `\n— ${office.name}`;
    const n = data.owner?.number;
    window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : whatsappShareUrl(text), '_blank', 'noopener');
  };
  const Tile = ({ n, label }: { n: number; label: string }) => (
    <div className="rounded-xl border border-black/10 px-3 py-2 text-center"><p className="tabular text-2xl font-bold">{n}</p><p className="text-xs">{label}</p></div>
  );
  const Money = ({ amount, label }: { amount: number; label: string }) => (
    <div className="rounded-xl border border-black/10 px-3 py-2 text-center"><p className="tabular text-lg font-bold">{formatMad(amount)}</p><p className="text-xs">{label}</p></div>
  );
  const H = ({ children }: { children: string }) => <h3 className="mb-2 mt-6 border-b border-black/15 pb-1 text-sm font-bold uppercase tracking-wide">{children}</h3>;

  return createPortal((
    <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-2xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8">
        <div className="no-print mb-4 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
            <Btn onClick={send} disabled={!data}><MessageCircle className="h-4 w-4" /> {t('Send update on WhatsApp')}</Btn>
          </div>
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
              {[data.owner ? `${t('Owner')}: ${data.owner.name}` : null, basisLabel(data.mandate.basis),
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

          {(data.lease || data.repairs.length > 0) && fin && (<>
            <H>{t('Rental and repairs')}</H>
            {data.lease && (
              <p className="text-sm">
                {[`${t('Tenant')}: ${data.lease.person?.full_name ?? '…'}`, `${formatMad(data.lease.l.rent_cents)} ${t('/ month')}`,
                  `${t('Start date')}: ${fmt(data.lease.l.start_date, 'medium', true)}`, data.lease.l.end_date ? `${t('End date')}: ${fmt(data.lease.l.end_date, 'medium', true)}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="mb-2 mt-3 text-xs font-semibold">{t('Last 12 months')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Money amount={fin.collected} label={t('Rent collected')} />
              <Money amount={fin.outstanding} label={t('Rent outstanding')} />
              <Money amount={fin.repairCosts} label={t('Repair costs')} />
              <Money amount={fin.afterRepairs} label={t('Rent after repair costs')} />
            </div>
            <p className="mt-1 text-xs opacity-70">{t('Rent after repair costs is the collected rent minus the repairs paid by the owner, before any agency fees.')}</p>
            {data.payments.length > 0 && (
              <ul className="mt-3 divide-y divide-black/10 text-sm">
                {data.payments.slice(0, 12).map(p => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span className="tabular">{fmt(p.due_date, 'medium', true)} · {formatMad(p.amount_cents)}</span>
                    <span>{p.status === 'paid' ? t('Paid on {date}', { date: fmt(p.paid_on ?? p.due_date, 'medium', true) }) : p.due_date < todayStr() ? t('Overdue') : t('Due')}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.repairs.length > 0 && (<>
              <p className="mb-1 mt-4 text-xs font-semibold">{t('Maintenance')}</p>
              <ul className="divide-y divide-black/10 text-sm">
                {data.repairs.slice(0, 10).map(({ m }) => (
                  <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>{m.title}</span>
                    <span>{[maintStatusLabel(m.status), m.cost_cents !== null ? formatMad(m.cost_cents) : null, m.cost_borne_by ? costByLabel(m.cost_borne_by) : null].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </>)}
          </>)}

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
