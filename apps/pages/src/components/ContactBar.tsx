import { Mail, MessageCircle, Phone } from 'lucide-react';
import type { PublicOffice } from '../lib/api';
import { telLink, waLink } from '../lib/contact';
import { t } from '../lib/i18n';
import { logEvent } from '../lib/api';

/** WhatsApp first (that is how clients in Morocco reach an agent), then phone, then email. */
export function ContactBar({ office, message, sticky, reference = null }: { office: PublicOffice; message: string; sticky?: boolean; reference?: string | null }) {
  if (!office.whatsapp && !office.phone && !office.email) return null;
  const inner = (
    <div className="mx-auto flex w-full max-w-3xl gap-2">
      {office.whatsapp && (
        <a href={waLink(office.whatsapp, message)} target="_blank" rel="noreferrer" onClick={() => logEvent(office.slug, reference, 'whatsapp')}
          className="gold-fill inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-brand-ink transition hover:brightness-105 active:scale-[.98]">
          <MessageCircle className="h-5 w-5 shrink-0" /><span className="truncate">{t('Contact on WhatsApp')}</span>
        </a>
      )}
      {office.phone && (
        <a href={telLink(office.phone)} onClick={() => logEvent(office.slug, reference, 'call')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-3 text-sm font-bold text-ink transition hover:bg-surface-2 active:scale-[.98] ${office.whatsapp ? '' : 'flex-1'}`}>
          <Phone className="h-5 w-5 shrink-0" /><span>{t('Call')}</span>
        </a>
      )}
      {office.email && (
        <a href={`mailto:${office.email}`} aria-label={t('Email')} title={t('Email')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-3 text-sm font-bold text-ink transition hover:bg-surface-2 active:scale-[.98] ${office.whatsapp || office.phone ? '' : 'flex-1'}`}>
          <Mail className="h-5 w-5 shrink-0" />{!office.whatsapp && !office.phone && <span>{t('Email')}</span>}
        </a>
      )}
    </div>
  );
  if (!sticky) return inner;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/10 bg-surface/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      {inner}
    </div>
  );
}
