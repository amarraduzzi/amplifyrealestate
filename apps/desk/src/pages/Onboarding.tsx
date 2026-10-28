import { useState, type FormEvent } from 'react';
import { Building2 } from 'lucide-react';
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
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t('Please enter the name of your office.')); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_slug: makeSlug(name), p_city: city.trim() || null });
    setBusy(false);
    if (error) setError(friendly(error));
    else onDone();
  };

  return (
    <div className="lg-show relative grid min-h-full place-items-center overflow-y-auto p-4">
      <span className="lg-grid pointer-events-none absolute inset-0" />
      <div className="rise relative w-full max-w-md">
        <AmplifyLogo className="mb-4 justify-center" />
        <div className="mb-4 flex justify-center"><LangSwitch light /></div>
        <Card>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand"><Building2 className="h-5 w-5" /></span>
              <h1 className="font-display mt-3 text-2xl font-bold">{t('Create your office')}</h1>
              <p className="mt-1 text-sm text-muted">{t('This is your agency or your own business. You can invite your team later.')}</p>
            </div>
            <Field label={t('Office name')}>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={t('e.g. Atlas Immobilier')} maxLength={120} required autoFocus />
            </Field>
            <Field label={t('City')}>
              <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder={t('Rabat')} maxLength={80} />
            </Field>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
            <Btn tone="brand" className="h-12 w-full text-base" disabled={busy}>{busy ? '…' : t('Create office')}</Btn>
            <button type="button" onClick={onSignOut} className="w-full text-center text-sm font-semibold text-muted hover:text-ink">{t('Sign out')}</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
