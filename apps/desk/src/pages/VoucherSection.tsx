import { useCallback, useEffect, useState } from 'react';
import { FileSignature, MessageCircle } from 'lucide-react';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { loadVouchers, voucherWhatsapp, type Voucher } from '../lib/vouchers';
import { VoucherForm } from '../components/VoucherForm';
import { Btn } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** On the property itself: let the visitor sign during the visit, and see who already signed. */
export function VoucherSection({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => { setRows((await loadVouchers(office.id, property.id)).rows); }, [office.id, property.id]);
  useEffect(() => { load(); }, [load]);
  const day = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('Visit vouchers')}</h3>
        {canWrite && <Btn tone="ghost" onClick={() => setOpen(true)}><FileSignature className="h-4 w-4" /> {t('New voucher')}</Btn>}
      </div>
      {rows.length === 0
        ? <p className="text-sm text-muted">{t('Let each visitor sign here during the visit: your proof if the deal is made without you.')}</p>
        : (
          <ul className="space-y-1.5 text-sm">
            {rows.map(v => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <span className="min-w-0 truncate"><span className="font-semibold">{v.visitor_name}</span> <span className="text-muted">· {day(v.visited_at)}</span></span>
                <a href={voucherWhatsapp(v.visitor_phone, v.token, property.title)} target="_blank" rel="noreferrer" aria-label={t('Send the copy on WhatsApp')} className="text-ok"><MessageCircle className="h-4 w-4" /></a>
              </li>
            ))}
          </ul>
        )}
      {open && <VoucherForm office={office} properties={[{ id: property.id, title: property.title, reference: property.reference }]} propertyId={property.id} onClose={() => setOpen(false)} onSaved={load} />}
    </div>
  );
}
