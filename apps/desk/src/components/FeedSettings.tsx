import { useEffect, useState } from 'react';
import { Check, Copy, Rss } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office } from '../lib/types';
import { PUBLIC_SITE } from '../lib/publicSite';
import { planError } from '../lib/plan';
import { Btn, Card } from './ui';

/** A secret link with all available properties as XML, for portals (Mubawab, Avito, Sarouty) that agreed to pick it up. */
export function FeedSettings({ office, canManage }: { office: Office; canManage: boolean }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canManage) return;
    supabase.rpc('my_feed_token', { p_org: office.id }).then(({ data, error }) => setToken(error ? undefined : (data as string | null)));
  }, [office.id, canManage]);
  if (!canManage || token === undefined || !PUBLIC_SITE) return null;
  const url = token ? `${PUBLIC_SITE}/feed/${token}.xml` : '';
  const renew = async (on: boolean) => {
    if (token && !window.confirm(on ? t('Make a new link? Portals using the old link must get the new one.') : t('Stop the link? Portals can no longer pick up your properties.'))) return;
    const { data, error } = await supabase.rpc('renew_feed_token', { p_org: office.id, p_on: on });
    if (error) setError(planError(error.message)); else { setError(null); setToken(data as string | null); }
  };
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Rss className="h-4 w-4 text-brand" /> {t('Feed for portals')}</h2>
      <p className="mt-1 text-sm text-muted">{t('One private link with all your published, available properties (photos, price, details), in a standard XML format. Give it only to a portal that agreed to pick up your listings automatically. Addresses, owners and mandates are never in it.')}</p>
      {token ? (
        <div className="mt-3 space-y-2">
          <p className="break-all rounded-xl bg-surface-2 px-3 py-2 text-xs" dir="ltr">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Btn tone="brand" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Copied') : t('Copy link')}</Btn>
            <Btn tone="ghost" onClick={() => window.open(url, '_blank', 'noopener')}>{t('Open')}</Btn>
            <Btn tone="ghost" onClick={() => renew(true)}>{t('New link')}</Btn>
            <Btn tone="ghost" onClick={() => renew(false)}>{t('Stop link')}</Btn>
          </div>
        </div>
      ) : <Btn className="mt-3" tone="brand" onClick={() => renew(true)}>{t('Make the link')}</Btn>}
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </Card>
  );
}
