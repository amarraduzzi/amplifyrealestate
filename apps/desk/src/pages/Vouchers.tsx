import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSignature, MessageCircle, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadVouchers, voucherUrl, voucherWhatsapp, type Voucher } from '../lib/vouchers';
import { PUBLIC_SITE } from '../lib/publicSite';
import { VoucherForm, type VoucherProperty } from '../components/VoucherForm';
import { Btn, Card } from '../components/ui';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-MA' } as const;

/** All visit vouchers: proof that a visitor saw a property through you. */
export function Vouchers({ office }: { office: Office }) {
  const [rows, setRows] = useState<Voucher[] | null>(null);
  const [props, setProps] = useState<VoucherProperty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const canWrite = office.role !== 'viewer';

  const load = useCallback(async () => {
    const [v, p] = await Promise.all([
      loadVouchers(office.id),
      supabase.from('properties').select('id, title, reference').eq('org_id', office.id).neq('status', 'withdrawn').order('created_at', { ascending: false }),
    ]);
    setRows(v.rows); setError(v.error);
    setProps((p.data ?? []) as VoucherProperty[]);
  }, [office.id]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(props.map(p => [p.id, p])), [props]);
  const when = (iso: string) => new Intl.DateTimeFormat(LOCALES[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Visit vouchers')}</h1>
          <p className="text-sm text-muted">{t('The visitor signs on your phone that he saw the property through you. If the deal is made without you, you have the proof.')}</p>
        </div>
        {canWrite && <Btn tone="brand" onClick={() => setOpen(true)} disabled={props.length === 0}><Plus className="h-4 w-4" /> {t('New voucher')}</Btn>}
      </div>
      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {rows === null && <p className="mt-10 text-center text-muted">…</p>}
      {rows !== null && rows.length === 0 && (
        <Card className="mt-6 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-brand" />
          <p className="mt-2 font-semibold">{t('No vouchers yet')}</p>
          <p className="mt-1 text-sm text-muted">{props.length === 0 ? t('Add a property first. Then let each visitor sign here during the visit.') : t('At the next visit, tap “New voucher” and let the visitor sign. It takes 30 seconds.')}</p>
        </Card>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="mt-6 divide-y divide-line/[0.07] rounded-2xl bg-surface ring-1 ring-line/[0.08]">
          {rows.map(v => {
            const p = byId.get(v.property_id);
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/[0.08] text-brand"><FileSignature className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{v.visitor_name} <span className="font-normal text-muted" dir="ltr">· {v.visitor_phone}</span></span>
                  <span className="block truncate text-xs text-muted">{p ? `${p.title} · ${p.reference}` : '…'} · {when(v.visited_at)} · {t('{n} months', { n: v.months })}</span>
                </span>
                <span className="flex gap-1.5">
                  {p && <a href={voucherWhatsapp(v.visitor_phone, v.token, p.title)} target="_blank" rel="noreferrer" title={t('Send the copy on WhatsApp')} aria-label={t('Send the copy on WhatsApp')}
                    className="grid h-9 w-9 place-items-center rounded-xl bg-ok/10 text-ok hover:bg-ok/15"><MessageCircle className="h-4 w-4" /></a>}
                  {PUBLIC_SITE && <a href={voucherUrl(v.token)} target="_blank" rel="noreferrer" title={t('Open')} aria-label={t('Open')}
                    className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted hover:text-ink"><ExternalLink className="h-4 w-4" /></a>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {open && <VoucherForm office={office} properties={props} onClose={() => setOpen(false)} onSaved={load} />}
    </div>
  );
}
