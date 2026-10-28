import { useCallback, useEffect, useState } from 'react';
import { loadNetwork, loadShares, networkCall, networkError, type Partner, type ShareRow } from '../lib/network';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { Btn, inputCls } from './ui';

/** In a property: share it with the partner offices of this office (percentage of the commission and a note for the partner). */
export function NetworkShare({ office, property, canWrite }: { office: Office; property: PropertyRow; canWrite: boolean }) {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [edit, setEdit] = useState<Record<string, { pct: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([loadNetwork(office.id), loadShares(property.id)]);
      setPartners(n.partners.filter(p => p.status === 'accepted')); setShares(s); setError(null);
    } catch (e) { setError(networkError(e instanceof Error ? e.message : t('Something went wrong.'))); setPartners([]); }
  }, [office.id, property.id]);
  useEffect(() => { load(); }, [load, property.status]);

  if (partners === null || (partners.length === 0 && !error)) return null; // nothing to show until a partner exists

  const run = async (fn: string, args: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    const err = await networkCall(fn, args);
    setBusy(false);
    if (err) setError(err); else await load();
  };

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">{t('Share with partner offices')}</h3>
      <p className="mt-1 text-xs text-muted">{t('Partners only see the title, price, area, rooms, description and your contact details. Never the address, the owner or your notes.')}</p>
      {property.status !== 'available' && <p className="mt-2 text-sm text-muted">{t('Only available properties can be shared.')}</p>}
      <ul className="mt-2 space-y-2">
        {partners.map(p => {
          const s = shares.find(x => x.partner_org === p.org_id);
          const e = edit[p.org_id] ?? { pct: s?.commission_pct != null ? String(Number(s.commission_pct)) : '', note: s?.note ?? '' };
          const set = (patch: Partial<typeof e>) => setEdit(m => ({ ...m, [p.org_id]: { ...e, ...patch } }));
          const save = () => run('share_property', { p_property: property.id, p_partner: p.org_id, p_pct: e.pct.trim() === '' ? null : Number(e.pct.replace(',', '.')), p_note: e.note });
          return (
            <li key={p.org_id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{p.name}</p>
                {s && <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{t('Shared')}</span>}
              </div>
              {canWrite && (property.status === 'available' || s) && (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs font-semibold">{t('Commission for the partner (%)')}
                    <input className={`${inputCls} mt-1`} inputMode="decimal" value={e.pct} onChange={ev => set({ pct: ev.target.value })} />
                  </label>
                  <label className="block text-xs font-semibold">{t('Note for the partner')}
                    <input className={`${inputCls} mt-1`} maxLength={500} value={e.note} onChange={ev => set({ note: ev.target.value })} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {property.status === 'available' && <Btn tone="brand" disabled={busy} onClick={save}>{s ? t('Save') : t('Share')}</Btn>}
                    {s && <Btn tone="ghost" disabled={busy} onClick={() => run('unshare_property', { p_property: property.id, p_partner: p.org_id })}>{t('Stop sharing')}</Btn>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
