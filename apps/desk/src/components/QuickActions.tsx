import { MessageCircle, Phone } from 'lucide-react';
import { t } from '../lib/i18n';
import { waLink } from './ContactLinks';

type Contact = { phone: string | null; whatsapp: string | null };

/** WhatsApp number when there is one, otherwise the phone number (most Moroccan numbers are mobiles). */
const waNumber = (c: Contact) => c.whatsapp?.trim() || c.phone?.trim() || null;
const telHref = (phone: string) => `tel:${phone.replace(/\s/g, '')}`;
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Two labelled buttons for a card. Nothing is drawn when there is no number. */
export function QuickBar({ c }: { c: Contact }) {
  const phone = c.phone?.trim() || null;
  const wa = waNumber(c);
  if (!phone && !wa) return null;
  return (
    <div className="mt-3 flex gap-2">
      {phone && (
        <a href={telHref(phone)} onClick={stop}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 py-2 text-sm font-semibold text-ink transition active:scale-95 hover:bg-surface-3">
          <Phone className="h-4 w-4" />{t('Call')}
        </a>
      )}
      {wa && (
        <a href={waLink(wa)} target="_blank" rel="noreferrer" onClick={stop}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ok/10 py-2 text-sm font-semibold text-ok transition active:scale-95 hover:bg-ok/15">
          <MessageCircle className="h-4 w-4" />{t('WhatsApp')}
        </a>
      )}
    </div>
  );
}

/** Two small round buttons for a compact row (for example on the Today screen). */
export function QuickIcons({ c }: { c: Contact }) {
  const phone = c.phone?.trim() || null;
  const wa = waNumber(c);
  if (!phone && !wa) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {phone && (
        <a href={telHref(phone)} onClick={stop} aria-label={t('Call')} title={t('Call')}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink ring-1 ring-line/10 transition active:scale-90 hover:bg-surface-3"><Phone className="h-4 w-4" /></a>
      )}
      {wa && (
        <a href={waLink(wa)} target="_blank" rel="noreferrer" onClick={stop} aria-label={t('WhatsApp')} title={t('WhatsApp')}
          className="grid h-9 w-9 place-items-center rounded-full bg-ok/10 text-ok transition active:scale-90 hover:bg-ok/15"><MessageCircle className="h-4 w-4" /></a>
      )}
    </span>
  );
}
