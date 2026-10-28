import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Network as NetworkIcon } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadNetwork, networkCall, networkError, type NetProperty, type Partner } from '../lib/network';
import { purposeLabel, typeLabel } from '../lib/labels';
import { waLink } from '../components/ContactLinks';
import { Btn, Card, inputCls } from '../components/ui';
import { friendly } from '../lib/errors';

/** Amplify Network: partner offices, and the properties they share with this office. */
export function Network({ office }: { office: Office }) {
  const [data, setData] = useState<{ partners: Partner[]; properties: NetProperty[] } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const canManage = office.role === 'owner' || office.role === 'manager';

  const load = useCallback(async () => {
    try { setData(await loadNetwork(office.id)); setError(null); }
    catch (e) { setError(networkError(friendly(e))); }
  }, [office.id]);
  useEffect(() => { setData(null); load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, done?: string) => {
    if (busy) return;
    setBusy(true); setError(null); setInfo(null);
    const err = await networkCall(fn, args);
    setBusy(false);
    if (err) { setError(err); return; }
    if (done) setInfo(done);
    await load();
  };

  const contact = (p: NetProperty) => {
    const text = t('Hello, I am interested in {title} ({reference}) for one of my clients. Is it still available?', { title: p.title, reference: p.reference });
    const n = p.whatsapp || p.phone;
    window.open(n ? `${waLink(n)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('Network')}</h1>
      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      {info && <p className="mt-4 rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{info}</p>}

      <Card className="mt-5">
        <h2 className="text-sm font-semibold">{t('Partner offices')}</h2>
        <p className="mt-1 text-sm text-muted">{t('Your office code')}: <span className="tabular font-bold text-ink">{office.slug}</span></p>
        <p className="text-xs text-muted">{t('Give this code to another office so it can invite you.')}</p>

        {canManage && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className={inputCls} placeholder={t('Office code')} value={code} onChange={e => setCode(e.target.value)} aria-label={t('Office code')} />
            <Btn tone="brand" disabled={busy || code.trim().length < 3}
              onClick={async () => { await run('request_partnership', { p_org: office.id, p_slug: code.trim() }, t('Invitation sent')); setCode(''); }}>{t('Send invitation')}</Btn>
          </div>
        )}

        {data === null && !error && <p className="mt-3 text-sm text-muted">…</p>}
        {data !== null && data.partners.length === 0 && <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-muted">{t('No partner offices yet.')}</p>}
        {data !== null && data.partners.length > 0 && (
          <ul className="mt-3 space-y-2">
            {data.partners.map(p => (
              <li key={p.id} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm"><span className="font-semibold">{p.name}</span>{p.city && <span className="text-muted"> · {p.city}</span>}</p>
                  <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-bold text-muted">
                    {p.status === 'accepted' ? t('Partner') : p.incoming ? t('Invited you') : t('Waiting for an answer')}
                  </span>
                </div>
                {canManage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.status === 'pending' && p.incoming && <>
                      <Btn tone="brand" disabled={busy} onClick={() => run('respond_partnership', { p_id: p.id, p_accept: true })}>{t('Accept')}</Btn>
                      <Btn tone="ghost" disabled={busy} onClick={() => run('respond_partnership', { p_id: p.id, p_accept: false })}>{t('Decline')}</Btn>
                    </>}
                    {p.status === 'pending' && !p.incoming && <Btn tone="ghost" disabled={busy} onClick={() => run('end_partnership', { p_id: p.id })}>{t('Cancel invitation')}</Btn>}
                    {p.status === 'accepted' && <Btn tone="danger" disabled={busy}
                      onClick={() => { if (window.confirm(t('Are you sure you want to end this partnership? Shared properties will no longer be visible.'))) run('end_partnership', { p_id: p.id }); }}>{t('End partnership')}</Btn>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mt-8 text-sm font-semibold">{t('Properties shared with you')}</h2>
      {data !== null && data.properties.length === 0 && (
        <Card className="mt-3 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><NetworkIcon className="h-6 w-6" /></span>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t('No partner has shared a property with you yet.')}</p>
        </Card>
      )}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {(data?.properties ?? []).map(p => (
          <li key={p.share_id}><Card>
            <p className="text-xs font-semibold text-muted">{p.office}</p>
            <p className="font-display text-lg font-bold">{p.title}</p>
            <p className="text-xs text-muted">{[p.reference, typeLabel(p.property_type), purposeLabel(p.purpose)].join(' · ')}</p>
            <p className="mt-1 text-lg font-bold">{p.price_cents !== null ? formatMad(p.price_cents) : '–'}</p>
            <p className="text-sm text-muted">{[[p.neighborhood, p.city].filter(Boolean).join(', '), p.bedrooms !== null ? `${p.bedrooms} ${t('Bedrooms')}` : null, p.bathrooms !== null ? `${p.bathrooms} ${t('Bathrooms')}` : null, p.area_m2 !== null ? `${Number(p.area_m2)} m²` : null].filter(Boolean).join(' · ')}</p>
            {p.description && <p className="mt-2 line-clamp-3 text-sm">{p.description}</p>}
            {p.commission_pct !== null && <p className="mt-2 text-sm font-semibold text-brand">{t('Commission offered to you')}: {t('{n}% of their commission', { n: Number(p.commission_pct) })}</p>}
            {p.note && <p className="mt-1 text-sm text-muted">{p.note}</p>}
            <Btn className="mt-3" onClick={() => contact(p)}><MessageCircle className="h-4 w-4" /> {t('Contact on WhatsApp')}</Btn>
          </Card></li>
        ))}
      </ul>
    </div>
  );
}
