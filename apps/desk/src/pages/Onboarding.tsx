import { useState, type FormEvent } from 'react';
import { Building2, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { AmplifyLogo } from '../components/Brand';
import { LangSwitch } from '../components/LangSwitch';
import { Btn, Card, Field, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

/** "bravo-immo" style slug plus a short random suffix, so two offices with the same name never collide. */
function makeSlug(name: string) {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'office';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** First screen after signing up: create your office. */
export function Onboarding({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [kind, setKind] = useState<'agent' | 'agence' | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t('Please enter the name of your office.')); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_slug: makeSlug(name), p_city: city.trim() || null });
    if (error) { setBusy(false); setError(friendly(error)); return; }
    if (kind === 'agent') {
      // the office exists; if this step fails, the agent can still switch later under Settings > Plan
      await supabase.rpc('set_edition', { p_org: data as string, p_edition: 'agent' });
      await supabase.from('organizations').update({ agent_name: name.trim() }).eq('id', data as string);
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="lg-show relative grid min-h-full place-items-center overflow-y-auto p-4">
      <span className="lg-grid pointer-events-none absolute inset-0" />
      <div className="rise relative w-full max-w-md">
        <AmplifyLogo className="mb-4 justify-center" />
        <div className="mb-4 flex justify-center"><LangSwitch light /></div>
        {kind === null ? (
          <Card>
            <h1 className="font-display text-2xl font-bold">{t('How do you work?')}</h1>
            <p className="mt-1 text-sm text-muted">{t('You can change this later.')}</p>
            <div className="mt-5 space-y-3">
              <button type="button" onClick={() => setKind('agent')} className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-4 text-start ring-1 ring-line/10 transition hover:ring-2 hover:ring-brand/40">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><UserRound className="h-5 w-5" /></span>
                <span><span className="block font-semibold">{t('I work alone')} · Amplify Agent</span>
                  <span className="mt-0.5 block text-sm text-muted">{t('Your own showcase page, visit vouchers that protect your commission, and sharing with colleagues. Free up to 3 properties.')}</span></span>
              </button>
              <button type="button" onClick={() => setKind('agence')} className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-4 text-start ring-1 ring-line/10 transition hover:ring-2 hover:ring-brand/40">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><Building2 className="h-5 w-5" /></span>
                <span><span className="block font-semibold">{t('We are an agency')} · Amplify Agence</span>
                  <span className="mt-0.5 block text-sm text-muted">{t('Sales, rentals, management, owners, invoices and your team. 30 days free.')}</span></span>
              </button>
              <button type="button" onClick={onSignOut} className="w-full pt-1 text-center text-sm font-semibold text-muted hover:text-ink">{t('Sign out')}</button>
            </div>
          </Card>
        ) : (
        <Card>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand">{kind === 'agent' ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span>
              <h1 className="font-display mt-3 text-2xl font-bold">{kind === 'agent' ? t('Your showcase') : t('Create your office')}</h1>
              <p className="mt-1 text-sm text-muted">{kind === 'agent' ? t('Clients will see this name on your page and on every property you send.') : t('This is your agency or your own business. You can invite your team later.')}</p>
            </div>
            <Field label={kind === 'agent' ? t('Your name') : t('Office name')}>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'agent' ? 'Salma Bennani' : t('e.g. Atlas Immobilier')} maxLength={120} required autoFocus />
            </Field>
            <Field label={t('City')}>
              <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder={t('Rabat')} maxLength={80} />
            </Field>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
            <Btn tone="brand" className="h-12 w-full text-base" disabled={busy}>{busy ? '…' : kind === 'agent' ? t('Start for free') : t('Create office')}</Btn>
            <button type="button" onClick={() => setKind(null)} className="w-full text-center text-sm font-semibold text-muted hover:text-ink">{t('Back')}</button>
          </form>
        </Card>
        )}
      </div>
    </div>
  );
}
