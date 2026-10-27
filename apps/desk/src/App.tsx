import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { t } from './lib/i18n';
import type { Office } from './lib/types';
import { AmplifyMark } from './components/Brand';
import { Shell, type View } from './components/Shell';
import { Btn } from './components/ui';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Properties } from './pages/Properties';
import { Leads } from './pages/Leads';
import { Viewings } from './pages/Viewings';
import { Team } from './pages/Team';
import { Tasks } from './pages/Tasks';
import { Today } from './pages/Today';

const ORG_KEY = 'desk-org';

function Splash() {
  return <div className="night grid h-full place-items-center"><AmplifyMark className="h-14 w-20 animate-pulse" /></div>;
}

function Workspace({ session }: { session: Session }) {
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('today');
  const [orgId, setOrgId] = useState<string | null>(() => { try { return localStorage.getItem(ORG_KEY); } catch { return null; } });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('memberships').select('role, organizations(id, name, slug, city)').eq('user_id', session.user.id);
    if (error) { setError(error.message); return; }
    setError(null);
    const list: Office[] = [];
    for (const m of (data ?? []) as any[]) {
      const o = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
      if (o) list.push({ id: o.id, name: o.name, slug: o.slug, city: o.city, role: m.role });
    }
    setOffices(list);
  }, [session.user.id]);
  useEffect(() => { load(); }, [load]);

  const signOut = () => { supabase.auth.signOut(); };
  const pick = (id: string) => { setOrgId(id); try { localStorage.setItem(ORG_KEY, id); } catch { /* private mode */ } };

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>
          <div className="flex justify-center gap-2"><Btn tone="brand" onClick={load}>{t('Try again')}</Btn><Btn onClick={signOut}>{t('Sign out')}</Btn></div>
        </div>
      </div>
    );
  }
  if (offices === null) return <Splash />;
  if (offices.length === 0) return <Onboarding onDone={load} onSignOut={signOut} />;

  const office = offices.find(o => o.id === orgId) ?? offices[0];
  return (
    <Shell offices={offices} office={office} view={view} onView={setView} onPick={pick} onSignOut={signOut}>
      {view === 'today' ? <Today key={office.id} office={office} userId={session.user.id} onGo={setView} />
        : view === 'leads' ? <Leads key={office.id} office={office} userId={session.user.id} />
        : view === 'tasks' ? <Tasks key={office.id} office={office} userId={session.user.id} />
        : view === 'viewings' ? <Viewings key={office.id} office={office} />
        : view === 'team' ? <Team key={office.id} office={office} userId={session.user.id} onSelfChanged={load} />
        : <Properties key={office.id} office={office} userId={session.user.id} />}
    </Shell>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <Workspace key={session.user.id} session={session} />;
}
