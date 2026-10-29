import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { photoUrl } from '../lib/photos';
import { LANGS, langLabel, removeAgentPhoto, uploadAgentPhoto } from '../lib/showcase';
import { Btn, Card, Field, inputCls } from './ui';
import { friendly } from '../lib/errors';

/** The person buyers see next to the WhatsApp button on every public property page. */
export function AgentProfile({ office, canManage }: { office: Office; canManage: boolean }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [langs, setLangs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoaded(false);
    supabase.from('organizations').select('agent_name, agent_role, agent_photo, agent_langs').eq('id', office.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(friendly(error));
        setName(data?.agent_name ?? ''); setRole(data?.agent_role ?? ''); setPhoto(data?.agent_photo ?? null); setLangs(data?.agent_langs ?? []);
        setLoaded(true);
      });
  }, [office.id]);

  const write = async (fields: Record<string, unknown>) => {
    const { data, error } = await supabase.from('organizations').update(fields).eq('id', office.id).select('id');
    if (error) { setError(friendly(error)); return false; }
    if (!data?.length) { setError(t('You do not have permission to do this.')); return false; }
    return true;
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const base = await uploadAgentPhoto(office.id, f);
      const old = photo;
      if (await write({ agent_photo: base })) { setPhoto(base); if (old) await removeAgentPhoto(old); }
      else await removeAgentPhoto(base);
    } catch (e) { setError(friendly(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const dropPhoto = async () => {
    if (!photo) return;
    setBusy(true); setError(null);
    if (await write({ agent_photo: null })) { await removeAgentPhoto(photo); setPhoto(null); }
    setBusy(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim().length < 2) { setError(t('Please enter a name of at least 2 letters.')); return; }
    setBusy(true); setError(null); setSaved(false);
    const ok = await write({ agent_name: name.trim() || null, agent_role: role.trim() || null, agent_langs: LANGS.filter(l => langs.includes(l)) });
    setBusy(false);
    if (ok) setSaved(true);
  };

  return (
    <Card className="mt-6">
      <h2 className="font-display text-lg font-semibold">{t('Contact person on your pages')}</h2>
      <p className="mt-1 text-sm text-muted">{t('Buyers write more easily to a person than to an office. This name and photo appear next to the WhatsApp button on every property page.')}</p>
      {canManage ? (
        <form onSubmit={save} className="mt-5 space-y-4">
          <div className="flex items-center gap-4">
            {photo
              ? <img src={photoUrl(photo, true)} alt="" className="h-20 w-20 rounded-full bg-surface-3 object-cover" />
              : <span className="grid h-20 w-20 place-items-center rounded-full bg-surface-2 text-muted"><UserRound className="h-9 w-9" /></span>}
            <div className="flex flex-wrap gap-2">
              <Btn type="button" tone="ghost" onClick={() => file.current?.click()} disabled={busy || !loaded}><Camera className="h-4 w-4" /> {photo ? t('Change photo') : t('Add a photo')}</Btn>
              {photo && <Btn type="button" tone="ghost" onClick={dropPhoto} disabled={busy}><Trash2 className="h-4 w-4" /> {t('Remove')}</Btn>}
              <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Name')}><input className={inputCls} value={name} onChange={e => { setName(e.target.value); setSaved(false); }} placeholder="Salma Bennani" maxLength={80} disabled={!loaded} /></Field>
            <Field label={t('Role')}><input className={inputCls} value={role} onChange={e => { setRole(e.target.value); setSaved(false); }} placeholder={t('Real estate advisor')} maxLength={80} disabled={!loaded} /></Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t('Languages spoken')}</p>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(l => (
                <button key={l} type="button" aria-pressed={langs.includes(l)} onClick={() => { setLangs(x => (x.includes(l) ? x.filter(y => y !== l) : [...x, l])); setSaved(false); }}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${langs.includes(l) ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink'}`}>
                  {langLabel(l)}
                </button>
              ))}
            </div>
          </div>
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
