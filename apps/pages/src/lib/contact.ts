import type { PublicOffice } from './api';

/** Moroccan numbers are often written 06 12 34 56 78: make that a working WhatsApp link. */
export function waLink(raw: string, text?: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '212' + d.slice(1);
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const telLink = (raw: string) => `tel:${raw.replace(/[^\d+]/g, '')}`;

/** The number a client should reach first: WhatsApp, otherwise the phone. */
export const hasContact = (o: PublicOffice) => Boolean(o.whatsapp || o.phone || o.email);
