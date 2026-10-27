import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { PUBLIC_SITE, officeUrl } from '../lib/publicSite';
import { Btn, Card, Field, inputCls } from '../components/ui';

/** Contact details that appear on every public page of this office, plus the link to the office page. */
export function PublicProfile({ office, canManage }: { office: Office; canManage: boolean }) {
  const [wa, setWa] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoaded(false);
    supabase.from('organizations').select('public_whatsapp, public_phone, public_email').eq('id', office.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setWa(data?.public_whatsapp ?? ''); setPhone(data?.public_phone ?? ''); setEmail(data?.public_email ?? '');
        setLoaded(true);
      });
  }, [office.id]);

  const digits = (s: string) => s.replace(/\D/g, '').length;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (wa.trim() && digits(wa) < 8) { setError(t('Please enter a valid WhatsApp number, for example 06 12 34 56 78.')); return; }
    if (phone.trim() && digits(phone) < 8) { setError(t('Please enter a valid phone number, for example 05 37 00 00 00.')); return; }
    setBusy(true); setError(null); setSaved(false);
    const { data, error } = await supabase.from('organizations')
      .update({ public_whatsapp: wa.trim() || null, public_phone: phone.trim() || null, public_email: email.trim() || null })
      .eq('id', office.id).select('id');
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return; }
    setSaved(true);
  };

  const link = PUBLIC_SITE ? officeUrl(office.slug, 'fr') : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt(t('Copy this link'), link); }
  };

  return (
    <Card className="mt-6">
      <h2 className="font-display text-lg font-semibold">{t('Public pages')}</h2>
      <p className="mt-1 text-sm text-muted">{t('Clients who open a property link see these contact details. Properties go online one by one, on the property itself.')}</p>

      {link && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input className={`${inputCls} min-w-0 flex-1 text-sm`} dir="ltr" readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label={t('Link to the office page')} />
          <Btn tone="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 sm:px-4"><ExternalLink className="h-4 w-4" /> {t('Open')}</a>
        </div>
      )}
      {!link && <p className="mt-4 text-sm text-muted">{t('The address of the public site is not set yet (VITE_PUBLIC_SITE_URL, see the README), so there is no link to show.')}</p>}

      {canManage ? (
        <form onSubmit={save} className="mt-5 space-y-4">
          <Field label={t('WhatsApp number')} hint={t('Clients tap this to message you about a property.')}>
            <input className={inputCls} dir="ltr" inputMode="tel" autoComplete="off" value={wa} onChange={e => { setWa(e.target.value); setSaved(false); }} placeholder="06 12 34 56 78" disabled={!loaded} />
          </Field>
          <Field label={t('Phone number')}>
            <input className={inputCls} dir="ltr" inputMode="tel" autoComplete="off" value={phone} onChange={e => { setPhone(e.target.value); setSaved(false); }} placeholder="05 37 00 00 00" disabled={!loaded} />
          </Field>
          <Field label={t('Email address')}>
            <input className={inputCls} type="email" dir="ltr" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setSaved(false); }} placeholder="contact@example.com" disabled={!loaded} />
          </Field>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          {saved && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{t('Saved.')}</p>}
          <Btn tone="brand" type="submit" disabled={busy || !loaded}>{busy ? '…' : t('Save')}</Btn>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">{t('Only owners and managers can change the contact details.')}</p>
      )}
    </Card>
  );
}
