import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LogOut, UserMinus, UserPlus } from 'lucide-react';
import type { OrgRole } from '@vastgoed/shared';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { MemberRow, Office } from '../lib/types';
import { ROLES, roleHint, roleLabel } from '../lib/labels';
import { Btn, Card, Field, inputCls } from '../components/ui';
import { PublicProfile } from './PublicProfile';

/** The database answers with short codes; show a sentence the person understands. */
function teamError(message: string): string {
  if (message.includes('gebruiker_niet_gevonden')) return t('There is no account with this email address yet. Ask the person to create an account first, then add them here.');
  if (message.includes('laatste_eigenaar')) return t('An office needs at least one owner.');
  if (message.includes('alleen_eigenaar')) return t('Only an owner can do this with an owner.');
  if (message.includes('niet_toegestaan')) return t('You do not have permission to do this.');
  if (message.includes('lid_niet_gevonden')) return t('This person is no longer a member.');
  return message;
}

const roleCls: Record<OrgRole, string> = {
  owner: 'bg-ink text-bg',
  manager: 'bg-qr/10 text-qr',
  agent: 'bg-ok/10 text-ok',
  viewer: 'bg-surface-3 text-muted',
};

export function Team({ office, userId, onSelfChanged }: { office: Office; userId: string; onSelfChanged: () => void }) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('agent');
  const [added, setAdded] = useState<string | null>(null);

  const isOwner = office.role === 'owner';
  const canManage = isOwner || office.role === 'manager';
  // A manager cannot hand out or take away the owner role.
  const assignable = ROLES.filter(r => r !== 'owner' || isOwner);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_members', { p_org: office.id });
    if (error) setError(teamError(error.message)); else { setError(null); setMembers((data ?? []) as MemberRow[]); }
  }, [office.id]);
  useEffect(() => { setMembers(null); load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setBusy('add'); setError(null); setAdded(null);
    const { error } = await supabase.rpc('add_member', { p_org: office.id, p_email: addr, p_role: role });
    setBusy(null);
    if (error) { setError(teamError(error.message)); return; }
    setAdded(addr); setEmail('');
    load();
  };

  const changeRole = async (m: MemberRow, r: OrgRole) => {
    if (r === m.role) return;
    setBusy(m.user_id); setError(null); setAdded(null);
    const { error } = await supabase.rpc('add_member', { p_org: office.id, p_email: m.email, p_role: r });
    setBusy(null);
    if (error) setError(teamError(error.message));
    load();
    if (m.user_id === userId) onSelfChanged(); // your own role changed: refresh what you are allowed to do
  };

  const remove = async (m: MemberRow) => {
    const self = m.user_id === userId;
    const ask = self ? t('Leave {office}? You will lose access to its data.', { office: office.name }) : t('Remove {email} from the team? They lose access to this office.', { email: m.email });
    if (!window.confirm(ask)) return;
    setBusy(m.user_id); setError(null); setAdded(null);
    const { error } = await supabase.rpc('remove_member', { p_org: office.id, p_user: m.user_id });
    setBusy(null);
    if (error) { setError(teamError(error.message)); load(); return; }
    if (self) onSelfChanged(); else load();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Team')}</h1>
        <p className="text-sm text-muted">{office.name}</p>
      </div>

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {added && <p className="mt-4 rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{t('{email} is now part of the team.', { email: added })}</p>}
      {members === null && !error && <p className="mt-10 text-center text-muted">…</p>}

      {members !== null && (
        <ul className="mt-5 space-y-2">
          {members.map(m => {
            const self = m.user_id === userId;
            // Who may be changed: owners and managers manage the team; only an owner touches an owner.
            const editable = canManage && (m.role !== 'owner' || isOwner);
            const leavable = self && !canManage;
            return (
              <li key={m.user_id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-3.5 sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" dir="ltr">{m.email}{self && <span className="ms-2 text-xs font-medium text-muted">{t('You')}</span>}</p>
                  <p className="text-xs text-muted">{roleHint(m.role)}</p>
                </div>
                {editable ? (
                  <select aria-label={t('Role')} className={`${inputCls} !w-auto !py-1.5 text-sm font-semibold`} value={m.role} disabled={busy === m.user_id}
                    onChange={e => changeRole(m, e.target.value as OrgRole)}>
                    {ROLES.filter(r => r !== 'owner' || isOwner).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${roleCls[m.role]}`}>{roleLabel(m.role)}</span>
                )}
                {editable && !self && (
                  <button type="button" onClick={() => remove(m)} disabled={busy === m.user_id} aria-label={t('Remove from team')} title={t('Remove from team')}
                    className="grid h-9 w-9 place-items-center rounded-full bg-danger/10 text-danger hover:bg-danger/15 disabled:opacity-40"><UserMinus className="h-4 w-4" /></button>
                )}
                {(leavable || (editable && self)) && (
                  <button type="button" onClick={() => remove(m)} disabled={busy === m.user_id} aria-label={t('Leave this office')} title={t('Leave this office')}
                    className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink disabled:opacity-40"><LogOut className="h-4 w-4" /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PublicProfile office={office} canManage={canManage} />

      {canManage ? (
        <Card className="mt-6">
          <h2 className="font-display text-lg font-semibold">{t('Add a team member')}</h2>
          <p className="mt-1 text-sm text-muted">{t('The person must first create an account with this email address. Then add them here and pick what they may do.')}</p>
          <form onSubmit={add} className="mt-4 space-y-4">
            <Field label={t('Email address')}>
              <input className={inputCls} type="email" dir="ltr" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required />
            </Field>
            <Field label={t('Role')} hint={roleHint(role)}>
              <select className={inputCls} value={role} onChange={e => setRole(e.target.value as OrgRole)}>
                {assignable.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </Field>
            <Btn tone="brand" type="submit" disabled={busy === 'add'}><UserPlus className="h-4 w-4" /> {busy === 'add' ? '…' : t('Add to team')}</Btn>
          </form>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted">{t('Only owners and managers can change the team.')}</p>
      )}
    </div>
  );
}
