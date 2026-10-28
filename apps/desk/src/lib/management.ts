import { formatMad } from '@vastgoed/shared';
import { supabase } from './supabase';

export type Contract = {
  id: string; org_id: string; property_id: string; owner_person_id: string; fee_pct: number; start_date: string; end_date: string | null;
  payout_day: number; owner_rib: string | null; notes: string | null; status: 'active' | 'ended';
};
export type Statement = {
  id: string; org_id: string; contract_id: string; property_id: string; owner_person_id: string; period: string; rent_cents: number;
  fee_pct: number; fee_cents: number; repairs_cents: number; payout_cents: number; status: 'open' | 'paid_out'; paid_out_on: string | null;
  details: { rent?: { due_date: string; paid_on: string; amount_cents: number; tenant: string }[]; repairs?: { title: string; done_on: string; cost_cents: number }[] };
};
export type OwnerLang = 'fr' | 'ar' | 'en' | 'nl';

/** The running contract of a property (null = none), or undefined when etappe 7b is not installed. */
export async function loadContract(propertyId: string): Promise<Contract | null | undefined> {
  const r = await supabase.from('management_contracts').select('*').eq('property_id', propertyId).eq('status', 'active').maybeSingle();
  return r.error ? undefined : (r.data as Contract | null);
}

export async function loadStatements(filter: { contractId?: string; orgId?: string; open?: boolean }): Promise<Statement[]> {
  let q = supabase.from('owner_statements').select('*').order('period', { ascending: false });
  if (filter.contractId) q = q.eq('contract_id', filter.contractId);
  if (filter.orgId) q = q.eq('org_id', filter.orgId);
  if (filter.open) q = q.eq('status', 'open');
  const r = await q;
  return r.error ? [] : (r.data ?? []) as Statement[];
}

export async function makeStatement(contractId: string, monthDay: string): Promise<string> {
  const { data, error } = await supabase.rpc('make_statement', { p_contract: contractId, p_month: monthDay });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function markPaidOut(id: string): Promise<string | null> {
  const r = await supabase.from('owner_statements').update({ status: 'paid_out' }).eq('id', id).select('id');
  if (r.error) return r.error.message;
  return r.data?.length ? null : 'You do not have permission to change this.';
}

/** First day of the previous month, YYYY-MM-DD: the month you usually settle. */
export function lastMonth(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ---- The statement in the owner's language ----------------------------------------------------------------
export const SW: Record<OwnerLang, {
  locale: string; title: string; owner: string; property: string; period: string; rent: string; fee: (p: number) => string; repairs: string;
  payout: string; owes: string; paid: (d: string) => string; open: string; rib: string; received: string; done: string; none: string;
  msg: (name: string, month: string, property: string, rent: string, fee: string, rep: string, pay: string, office: string) => string;
}> = {
  fr: { locale: 'fr-FR', title: 'Relevé de gestion', owner: 'Propriétaire', property: 'Bien', period: 'Période', rent: 'Loyers encaissés', fee: p => `Honoraires de gestion (${p} %)`,
    repairs: 'Réparations à votre charge', payout: 'Montant à vous verser', owes: 'Montant restant à votre charge', paid: d => `Versé le ${d}`, open: 'À verser',
    rib: 'Versement sur le RIB', received: 'Loyers reçus', done: 'Réparations', none: 'Aucun mouvement ce mois-ci.',
    msg: (n, m, p, r, f, rep, pay, o) => `Bonjour ${n}, voici votre relevé de ${m} pour ${p} :\nLoyers encaissés : ${r}\nHonoraires de gestion : -${f}\nRéparations : -${rep}\nMontant à vous verser : ${pay}\n${o}` },
  en: { locale: 'en-GB', title: 'Management statement', owner: 'Owner', property: 'Property', period: 'Period', rent: 'Rent collected', fee: p => `Management fee (${p}%)`,
    repairs: 'Repairs at your expense', payout: 'Amount to be paid to you', owes: 'Amount you owe', paid: d => `Paid on ${d}`, open: 'To be paid',
    rib: 'Paid to bank account', received: 'Rent received', done: 'Repairs', none: 'Nothing happened this month.',
    msg: (n, m, p, r, f, rep, pay, o) => `Hello ${n}, here is your statement for ${m} for ${p}:\nRent collected: ${r}\nManagement fee: -${f}\nRepairs: -${rep}\nAmount to be paid to you: ${pay}\n${o}` },
  nl: { locale: 'nl-NL', title: 'Beheerafrekening', owner: 'Eigenaar', property: 'Pand', period: 'Periode', rent: 'Ontvangen huur', fee: p => `Beheerkosten (${p}%)`,
    repairs: 'Reparaties voor uw rekening', payout: 'Aan u uit te betalen', owes: 'Door u te betalen', paid: d => `Uitbetaald op ${d}`, open: 'Nog uit te betalen',
    rib: 'Uitbetaling op rekening', received: 'Ontvangen huur', done: 'Reparaties', none: 'Geen bewegingen deze maand.',
    msg: (n, m, p, r, f, rep, pay, o) => `Hallo ${n}, hier is uw afrekening van ${m} voor ${p}:\nOntvangen huur: ${r}\nBeheerkosten: -${f}\nReparaties: -${rep}\nAan u uit te betalen: ${pay}\n${o}` },
  ar: { locale: 'ar-MA', title: 'كشف التسيير', owner: 'المالك', property: 'العقار', period: 'الفترة', rent: 'الكراء المحصل', fee: p => `أتعاب التسيير (${p}٪)`,
    repairs: 'إصلاحات على حسابكم', payout: 'المبلغ الذي سيحول لكم', owes: 'المبلغ المتبقي على حسابكم', paid: d => `حول بتاريخ ${d}`, open: 'في انتظار التحويل',
    rib: 'التحويل إلى الحساب', received: 'الكراء المستلم', done: 'الإصلاحات', none: 'لا توجد حركات هذا الشهر.',
    msg: (n, m, p, r, f, rep, pay, o) => `مرحبا ${n}، هذا كشف ${m} الخاص بـ ${p}:\nالكراء المحصل: ${r}\nأتعاب التسيير: -${f}\nالإصلاحات: -${rep}\nالمبلغ الذي سيحول لكم: ${pay}\n${o}` },
};

export const monthName = (period: string, lang: OwnerLang) =>
  new Intl.DateTimeFormat(SW[lang].locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}T00:00:00Z`));

export const statementMessage = (s: Statement, lang: OwnerLang, owner: string, property: string, office: string) =>
  SW[lang].msg(owner, monthName(s.period, lang), property, formatMad(s.rent_cents), formatMad(s.fee_cents), formatMad(s.repairs_cents), formatMad(s.payout_cents), `— ${office}`);
