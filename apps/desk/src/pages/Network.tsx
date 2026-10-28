import { useCallback, useEffect, useState } from 'react';
import { Handshake, MessageCircle, Network as NetworkIcon, Send } from 'lucide-react';
import { formatMad } from '@vastgoed/shared';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { loadNetwork, loadWork, networkCall, networkError, type Collab, type NetProperty, type Partner, type Referral } from '../lib/network';
import { CollabsTab, ProposeCollab, ReferralForm, ReferralsTab } from './NetworkWork';
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
  const canWrite = office.role !== 'viewer';
  const [tab, setTab] = useState<'partners' | 'shared' | 'referrals' | 'collabs'>('partners');
  const [work, setWork] = useState<{ referrals: Referral[]; collabs: Collab[] } | null>(null);
  const [refForm, setRefForm] = useState(false);
  const [propose, setPropose] = useState<NetProperty | null>(null);

  const load = useCallback(async () => {
    loadWork(office.id).then(setWork);
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
      {(() => {
        const incomingRefs = work?.referrals.filter(r => !r.outgoing && r.status === 'sent').length ?? 0;
        const incomingCols = work?.collabs.filter(c => c.listing && c.status === 'proposed').length ?? 0;
        const pending = data?.partners.filter(p => p.status === 'pending' && p.incoming).length ?? 0;
        return (
          <div className="mt-5 flex flex-wrap items-center gap-1.5" role="tablist">
            {([['partners', t('Partner offices'), pending], ['shared', t('Shared with you'), data?.properties.length ?? 0], ['referrals', t('Referred clients'), incomingRefs], ['collabs', t('Collaborations'), incomingCols]] as const)
              .filter(([x]) => (x !== 'referrals' && x !== 'collabs') || work)
              .map(([x, label, n]) => (
                <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === x ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`}>
                  {label}{n ? <span className="ms-1.5 rounded-full bg-brand px-1.5 text-xs text-white">{n}</span> : null}</button>))}
            {canWrite && work && (data?.partners.some(p => p.status === 'accepted') ?? false) && <Btn tone="brand" className="ms-auto" onClick={() => setRefForm(true)}><Send className="h-4 w-4" /> {t('Send a client')}</Btn>}
          </div>
        );
      })()}
      {tab === 'referrals' && work && <ReferralsTab referrals={work.referrals} canWrite={canWrite} run={(fn, args) => run(fn, args)} />}
      {tab === 'collabs' && work && <CollabsTab office={office} collabs={work.collabs} canWrite={canWrite} run={(fn, args) => run(fn, args)} />}
      {refForm && data && <ReferralForm office={office} partners={data.partners} onClose={() => setRefForm(false)} onSent={() => { setRefForm(false); setTab('referrals'); load(); }} />}
      {propose && <ProposeCollab office={office} p={propose} onClose={() => setPropose(null)} onSent={() => { setPropose(null); setTab('collabs'); load(); }} />}

      {tab === 'partners' && <Card className="mt-5">
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
      </Card>}

      {tab === 'shared' && <>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {canWrite && work && <Btn tone="brand" onClick={() => setPropose(p)}><Handshake className="h-4 w-4" /> {t('I have a client')}</Btn>}
              <Btn onClick={() => contact(p)}><MessageCircle className="h-4 w-4" /> {t('Contact on WhatsApp')}</Btn>
            </div>
          </Card></li>
        ))}
      </ul>
      </>}
    </div>
  );
}
