import { Mail, MessageCircle, Phone } from 'lucide-react';
import { t } from '../lib/i18n';

type Contact = { phone: string | null; whatsapp: string | null; email: string | null };

/** Moroccan numbers are often written 06 12 34 56 78: make that a working WhatsApp link. */
export const waLink = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '212' + d.slice(1);
  return `https://wa.me/${d}`;
};

export function ContactLinks({ c }: { c: Contact }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {c.phone && <a className="inline-flex items-center gap-1.5 text-muted hover:text-ink" href={`tel:${c.phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}><Phone className="h-3.5 w-3.5" /><span dir="ltr">{c.phone}</span></a>}
      {c.whatsapp && <a className="inline-flex items-center gap-1.5 text-ok hover:underline" href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><MessageCircle className="h-3.5 w-3.5" /><span dir="ltr">{c.whatsapp}</span></a>}
      {c.email && <a className="inline-flex items-center gap-1.5 text-muted hover:text-ink" href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}><Mail className="h-3.5 w-3.5" /><span dir="ltr">{c.email}</span></a>}
      {!c.phone && !c.whatsapp && !c.email && <span className="text-muted">{t('No contact details')}</span>}
    </div>
  );
}
