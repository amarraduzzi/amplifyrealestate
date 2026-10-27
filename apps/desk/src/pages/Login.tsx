import { LangSwitch } from '../components/LangSwitch';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import { Btn, Field, inputCls } from '../components/ui';
import { Showcase, promises } from '../components/Showcase';

type Mode = 'login' | 'signup';

export function Login() {
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).has('signup') ? 'signup' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => { setMode(m); setError(null); setInfo(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setInfo(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(/invalid login/i.test(error.message) ? t('Wrong email or password.') : error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin } });
      if (error) setError(error.message);
      else if (!data.session) setInfo(t('Account created. Open the link we emailed you to confirm it, then sign in.'));
    }
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <Showcase />
      <div className="lg-side relative z-10 -mt-8 grid min-w-0 flex-1 items-start justify-items-center rounded-t-[2rem] px-5 pb-8 pt-7 sm:place-items-center sm:p-6 lg:mt-0 lg:max-w-xl lg:overflow-y-auto lg:rounded-none">
        <form onSubmit={submit} className="rise w-full min-w-0 max-w-sm space-y-5">
          <div className="flex justify-end"><LangSwitch light /></div>
          <div>
            <div className="mb-6 grid grid-cols-2 rounded-full bg-[rgb(var(--ink)/.06)] p-1 text-sm font-semibold" role="tablist">
              {(['login', 'signup'] as const).map(m => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
                  className={`h-10 rounded-full transition-colors ${mode === m ? 'bg-[#001E3E] text-white shadow' : 'text-muted hover:text-ink'}`}>
                  {m === 'login' ? t('Sign in') : t('Create account')}
                </button>
              ))}
            </div>
            <h1 className="lg-h text-[2.75rem] sm:text-5xl">{mode === 'login' ? t('Welcome back') : t('Create your account')}</h1>
            <p className="mt-2 text-muted">{mode === 'login' ? t('Your properties, prices and status.') : t('Set up your office in a minute.')}</p>
          </div>
          <Field label={t('Email')}>
            <input className={inputCls} dir="ltr" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('Password')} hint={mode === 'signup' ? t('At least 8 characters.') : undefined}>
            <input className={inputCls} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          {info && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{info}</p>}
          <Btn tone="brand" className="h-12 w-full text-base" disabled={busy}>{busy ? '…' : mode === 'login' ? t('Sign in') : t('Create account')}</Btn>
          <ul className="space-y-3 border-t border-line/[0.08] pt-5 text-sm text-muted lg:hidden">
            {promises().map(x => (
              <li key={x} className="flex items-center gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#05B962] text-[#001E3E]"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M5 12l4 4 10-10" /></svg></span>{x}</li>
            ))}
          </ul>
        </form>
      </div>
    </div>
  );
}
