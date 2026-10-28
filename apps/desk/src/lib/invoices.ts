import { supabase } from './supabase';

export type InvoiceStatus = 'issued' | 'paid' | 'cancelled';
export type PaymentMethod = 'transfer' | 'cheque' | 'cash' | 'card' | 'other';
export type InvoiceLine = { label: string; qty: number; unit_cents: number; total_cents: number };
export type Seller = {
  name: string; form: 'company' | 'auto_entrepreneur' | null; address: string | null; ice: string | null; if: string | null;
  rc: string | null; tp: string | null; rib: string | null; phone: string | null; email: string | null; footer: string | null; office: string;
};
export type InvoiceRow = {
  id: string; org_id: string; deal_id: string | null; year: number; seq: number; number: string; title: 'facture' | 'note_honoraires';
  issued_on: string; due_on: string | null; seller: Seller; client_name: string; client_address: string | null; client_ice: string | null;
  lines: InvoiceLine[]; subtotal_cents: number; vat_rate: number; vat_cents: number; total_cents: number; notes: string | null;
  status: InvoiceStatus; paid_on: string | null; payment_method: PaymentMethod | null; cancelled_on: string | null; created_at: string;
};
export type Billing = {
  legal_name: string | null; legal_form: 'company' | 'auto_entrepreneur' | null; legal_address: string | null; ice: string | null;
  if_number: string | null; rc_number: string | null; tp_number: string | null; rib: string | null; vat_rate: number; invoice_footer: string | null;
};

export const BILLING_COLUMNS = 'legal_name, legal_form, legal_address, ice, if_number, rc_number, tp_number, rib, vat_rate, invoice_footer';
export const billingReady = (b: Billing | null) => !!b && !!b.legal_name?.trim() && !!b.ice && !!b.if_number?.trim();

/** Billing details of the office, or null when etappe 6f is not installed yet. */
export async function loadBilling(orgId: string): Promise<Billing | null> {
  const r = await supabase.from('organizations').select(BILLING_COLUMNS).eq('id', orgId).maybeSingle();
  return r.error ? null : (r.data as Billing | null);
}

export async function loadInvoices(orgId: string, scope: { dealId?: string } = {}): Promise<InvoiceRow[] | null> {
  let q = supabase.from('invoices').select('*').eq('org_id', orgId).order('year', { ascending: false }).order('seq', { ascending: false });
  if (scope.dealId) q = q.eq('deal_id', scope.dealId);
  const r = await q;
  return r.error ? null : (r.data ?? []) as InvoiceRow[];
}

/** The database gives the number and fixes the amounts. Returns the new id, or throws a readable code. */
export async function createInvoice(o: {
  orgId: string; dealId: string | null; title: 'facture' | 'note_honoraires'; clientName: string; clientAddress: string; clientIce: string;
  lines: { label: string; qty: number; unit_cents: number }[]; issuedOn: string; dueOn: string | null; notes: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_invoice', {
    p_org: o.orgId, p_deal: o.dealId, p_title: o.title, p_client_name: o.clientName, p_client_address: o.clientAddress || null,
    p_client_ice: o.clientIce || null, p_lines: o.lines, p_issued_on: o.issuedOn, p_due_on: o.dueOn, p_notes: o.notes || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus, method?: PaymentMethod | null): Promise<string | null> {
  const patch: Record<string, unknown> = { status };
  if (status === 'paid') patch.payment_method = method ?? null;
  const r = await supabase.from('invoices').update(patch).eq('id', id).select('id');
  if (r.error) return r.error.message;
  return r.data?.length ? null : 'You do not have permission to change this.';
}

/** The amounts the app shows before the database fixes them (same rounding). */
export function previewTotals(lines: { qty: number; unit_cents: number }[], vatRate: number) {
  const sub = lines.reduce((s, l) => s + Math.round(l.qty * l.unit_cents), 0);
  const vat = Math.round(sub * vatRate / 100);
  return { sub, vat, total: sub + vat };
}

// ---- Amount in words (French), as Moroccan invoices write it: "Arrêtée la présente facture à la somme de ..." ----
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return 'dix-' + UNITS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    return TENS[t] + (u === 0 ? '' : u === 1 ? '-et-un' : '-' + UNITS[u]);
  }
  if (n < 80) return n === 71 ? 'soixante-et-onze' : 'soixante-' + below100(n - 60);
  if (n === 80) return 'quatre-vingts';
  return 'quatre-vingt-' + below100(n - 80);
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (h === 0) return below100(r);
  const head = h === 1 ? 'cent' : UNITS[h] + '-cent' + (r === 0 ? 's' : '');
  return r === 0 ? head : head + '-' + below100(r);
}

/** 1250000 -> "un-million-deux-cent-cinquante-mille" (1990 spelling, hyphens everywhere). */
export function numberToFrench(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (billions) parts.push(below1000(billions) + (billions > 1 ? '-milliards' : '-milliard'));
  if (millions) parts.push(below1000(millions) + (millions > 1 ? '-millions' : '-million'));
  if (thousands) parts.push(thousands === 1 ? 'mille' : below1000(thousands).replace(/cents$/, 'cent') + '-mille');
  if (rest) parts.push(below1000(rest));
  return parts.join('-');
}

/** "cinquante-mille dirhams" or "mille-deux-cent dirhams et cinquante centimes". */
export function amountInWords(cents: number): string {
  const dh = Math.floor(cents / 100), c = cents % 100;
  // "un million de dirhams", but "un million deux cents dirhams"
  const de = dh >= 1e6 && dh % 1e6 === 0 ? 'de ' : '';
  const main = `${numberToFrench(dh)} ${de}dirham${dh > 1 ? 's' : ''}`;
  return c ? `${main} et ${numberToFrench(c)} centime${c > 1 ? 's' : ''}` : main;
}
