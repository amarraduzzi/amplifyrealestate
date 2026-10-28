import { useState, type FormEvent } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import type { DealPurpose } from '@vastgoed/shared';
import { submitInquiry } from '../lib/api';
import { purposeLabel } from '../lib/format';
import { t } from '../lib/i18n';

const PURPOSES: DealPurpose[] = ['sale', 'rent_long', 'rent_short'];
const field = 'w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand focus:ring-4 focus:ring-brand/15';

/** "Leave your number, we call you back": for visitors who do not want to start a WhatsApp chat themselves. */
export function InquiryForm({ slug, reference, askPurpose }: { slug: string; reference: string | null; askPurpose?: boolean }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [purpose, setPurpose] = useState<DealPurpose>('sale');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'busy') return;
    if (name.trim().length < 2) { setError(t('Please enter your name.')); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) { setError(t('Please enter a valid phone number.')); return; }
    setState('busy'); setError(null);
    const r = await submitInquiry({ slug, reference, name: name.trim(), phone: phone.trim(), message: message.trim(), purpose: askPurpose ? purpose : undefined, trap });
    if (r === 'ok') { setState('done'); return; }
    setState('idle');
    setError(r === 'invalid' ? t('Please check your name and phone number.') : r === 'busy' ? t('Too many requests right now. Please try again in a moment, or contact us on WhatsApp.') : t('Sending failed. Check your connection and try again.'));
  };

  if (state === 'done') {
    return (
      <section className="card rounded-2xl p-4 text-center sm:p-5">
        <CheckCircle2 className="mx-auto h-8 w-8 text-ok" />
        <h2 className="font-display mt-2 text-lg font-bold">{t('Thank you, we will call you back')}</h2>
        <p className="mt-1 text-sm text-muted">{t('Your request has been sent to the agency.')}</p>
      </section>
    );
  }

  return (
    <section className="card rounded-2xl p-4 sm:p-5">
      <h2 className="font-display text-lg font-bold">{t('Be called back')}</h2>
      <p className="mt-0.5 text-sm text-muted">{t('Leave your number, the agency will contact you.')}</p>
      <form onSubmit={submit} className="mt-3 space-y-2.5" noValidate>
        {askPurpose && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('I am looking for')}>
            {PURPOSES.map(p => (
              <button key={p} type="button" aria-pressed={purpose === p} onClick={() => setPurpose(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${purpose === p ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>{purposeLabel(p)}</button>
            ))}
          </div>
        )}
        <input className={field} value={name} onChange={e => setName(e.target.value)} placeholder={t('Your name')} aria-label={t('Your name')} autoComplete="name" maxLength={120} />
        <input className={field} value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('Phone or WhatsApp')} aria-label={t('Phone or WhatsApp')} autoComplete="tel" inputMode="tel" dir="ltr" maxLength={40} />
        <textarea className={field} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('Your message (optional)')} aria-label={t('Your message (optional)')} maxLength={1000} />
        {/* Hidden from people, robots fill it in. */}
        <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" name="website" />
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={state === 'busy'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-bg transition hover:opacity-90 disabled:opacity-50">
          <Send className="h-4 w-4 rtl:-scale-x-100" /> {state === 'busy' ? '…' : t('Send my request')}
        </button>
        <p className="text-xs text-muted">{t('Your details are only shared with this agency.')}</p>
      </form>
    </section>
  );
}
