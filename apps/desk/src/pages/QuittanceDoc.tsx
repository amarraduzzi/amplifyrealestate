import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Printer, X } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PersonRow } from '../lib/types';
import type { PaymentRow } from '../lib/payments';
import { amountInWords } from '../lib/invoices';
import { waLink } from '../components/ContactLinks';
import { Btn } from '../components/ui';

type Lang = 'fr' | 'ar';
type Info = { owner: string | null; place: string; address: string | null; agency: string; agencyAddress: string | null; ice: string | null };

const W = {
  fr: {
    title: 'Quittance de loyer', number: 'N°', period: 'Période', tenant: 'Locataire', owner: 'Bailleur', property: 'Logement',
    body: (agency: string, owner: string | null, tenant: string, amount: string, words: string, month: string, place: string, paid: string) =>
      `${agency}${owner ? `, agissant pour le compte de ${owner}, propriétaire,` : ''} reconnaît avoir reçu de ${tenant} la somme de ${amount} (${words}) au titre du loyer du mois de ${month} pour le logement ${place}, le ${paid}.`,
    note: 'Cette quittance annule tous les reçus qui auraient pu être établis précédemment pour le même mois. Elle ne préjuge pas des sommes restant dues au titre de mois antérieurs.',
    sign: 'Cachet et signature', locale: 'fr-FR',
    msg: (n: string, month: string, amount: string, o: string) => `Bonjour ${n}, nous confirmons la réception de votre loyer de ${month} (${amount}). Votre quittance est en pièce jointe. Merci !\n${o}`,
  },
  ar: {
    title: 'وصل أداء الكراء', number: 'رقم', period: 'الفترة', tenant: 'المكتري', owner: 'المكري', property: 'المحل',
    body: (agency: string, owner: string | null, tenant: string, amount: string, _w: string, month: string, place: string, paid: string) =>
      `تشهد ${agency}${owner ? `، نيابة عن المالك ${owner}،` : ''} أنها توصلت من ${tenant} بمبلغ ${amount} عن كراء شهر ${month} للمحل ${place}، بتاريخ ${paid}.`,
    note: 'يلغي هذا الوصل كل وصل سابق عن نفس الشهر، ولا يبرئ ذمة المكتري من المبالغ المتبقية عن الأشهر السابقة.',
    sign: 'الختم والتوقيع', locale: 'ar-MA',
    msg: (n: string, month: string, amount: string, o: string) => `مرحبا ${n}، نؤكد توصلنا بكراء شهر ${month} (${amount}). تجدون وصل الأداء مرفقا. شكرا!\n${o}`,
  },
};

/** A rent receipt for one paid month, printable in French or Arabic. */
export function QuittanceDoc({ office, payment, leaseId, tenant, propertyTitle, onClose }: {
  office: Office; payment: PaymentRow; leaseId: string; tenant: PersonRow | undefined; propertyTitle: string; onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>('fr');
  const [info, setInfo] = useState<Info | null>(null);
  const w = W[lang];

  useEffect(() => {
    let live = true;
    (async () => {
      const l = await supabase.from('leases').select('property_id').eq('id', leaseId).maybeSingle();
      const pid = (l.data as { property_id: string } | null)?.property_id;
      const [pr, pp, org] = await Promise.all([
        pid ? supabase.from('properties').select('title, address_note, neighborhood, city').eq('id', pid).maybeSingle() : Promise.resolve({ data: null }),
        pid ? supabase.from('property_parties').select('people(full_name)').eq('property_id', pid).eq('role', 'owner').limit(1) : Promise.resolve({ data: [] }),
        supabase.from('organizations').select('name, legal_name, legal_address, ice').eq('id', office.id).maybeSingle(),
      ]);
      const p = pr.data as { title: string; address_note: string | null; neighborhood: string | null; city: string | null } | null;
      const ownerRow = ((pp.data ?? []) as { people: { full_name: string } | { full_name: string }[] | null }[])[0];
      const owner = ownerRow ? (Array.isArray(ownerRow.people) ? ownerRow.people[0]?.full_name : ownerRow.people?.full_name) ?? null : null;
      const o = (org.data ?? {}) as { name?: string; legal_name?: string | null; legal_address?: string | null; ice?: string | null };
      const address = p?.address_note?.trim() || null;
      const place = address || [p?.title ?? propertyTitle, p?.neighborhood, p?.city].filter(Boolean).join(', ');
      if (live) setInfo({ owner, place, address, agency: o.legal_name || o.name || office.name, agencyAddress: o.legal_address ?? null, ice: o.ice ?? null });
    })();
    return () => { live = false; };
  }, [leaseId, office.id, office.name, propertyTitle]);

  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(w.locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const month = fmt(payment.due_date, { month: 'long', year: 'numeric' });
  const paid = fmt(payment.paid_on ?? payment.due_date, { dateStyle: 'long' });
  const number = `Q-${payment.due_date.slice(0, 7).replace('-', '')}-${leaseId.slice(0, 4).toUpperCase()}`;
  const name = tenant?.full_name ?? '';

  const send = () => {
    const first = name.trim().split(/\s+/)[0] ?? '';
    const text = w.msg(first, month, formatMad(payment.amount_cents), `— ${info?.agency ?? office.name}`);
    const n = tenant?.whatsapp || tenant?.phone;
    window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return createPortal((
    <div className="report-overlay fixed inset-0 z-[60] overflow-y-auto bg-night/60 p-2 sm:p-6">
      <div className="report-sheet pop mx-auto max-w-2xl rounded-2xl bg-white p-5 text-[#111] shadow-2xl sm:p-8" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        <div className="no-print mb-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Btn tone="brand" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('Print or save as PDF')}</Btn>
              <Btn onClick={send}><MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')}</Btn>
            </div>
            <button onClick={onClose} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex gap-1.5">
            {(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-black text-white' : 'bg-black/5'}`}>{l}</button>)}
          </div>
          <p className="text-xs text-black/60">{t('Save it as PDF, then attach it to the WhatsApp message.')}</p>
        </div>

        {!info ? <p className="text-center text-black/50">…</p> : (
          <div className="text-[13.5px] leading-relaxed">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold">{info.agency}</p>
                {info.agencyAddress && <p className="text-xs">{info.agencyAddress}</p>}
                {info.ice && <p className="text-xs">ICE : {info.ice}</p>}
              </div>
              <div className="text-end">
                <p className="text-xl font-black uppercase tracking-wide">{w.title}</p>
                <p className="text-xs">{w.number} <span dir="ltr">{number}</span></p>
                <p className="text-xs capitalize">{w.period} : {month}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">{w.tenant}</p><p className="font-semibold">{name}</p></div>
              <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">{w.owner}</p><p className="font-semibold">{info.owner ?? info.agency}</p></div>
              <div className="rounded-lg border border-black/15 p-3"><p className="text-[11px] font-bold uppercase text-black/60">{w.property}</p><p className="font-semibold">{info.place}</p></div>
            </div>

            <p className="mt-6 rounded-xl bg-black/[0.04] p-4 text-center font-display text-3xl font-bold tabular-nums">{formatMad(payment.amount_cents)}</p>
            <p className="mt-5">{w.body(info.agency, info.owner, name, formatMad(payment.amount_cents), amountInWords(payment.amount_cents), month, info.address ? (lang === 'fr' ? `situé ${info.address}` : `الكائن ب${info.address}`) : `« ${info.place} »`, paid)}</p>
            <p className="mt-3 text-xs text-black/60">{w.note}</p>

            <div className="mt-8 ms-auto w-56 rounded-lg border border-black/15 p-3 text-center">
              <p className="text-[11px] font-bold uppercase text-black/60">{w.sign}</p>
              <div className="h-20" />
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
