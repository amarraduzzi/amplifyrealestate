import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLang, t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import type { AdLang } from '../lib/postings';
import { PUBLIC_SITE } from '../lib/publicSite';
import { printVitrine, type PaperSize } from '../lib/vitrine';
import { Btn } from './ui';

/** Window card for the agency shop window: a clean A4 or A3 poster with photo, price and a QR code to the public page. */
export function VitrineCard({ office, property }: { office: Office; property: PropertyRow }) {
  const [lang, setLang] = useState<AdLang>(getLang() === 'ar' ? 'ar' : 'fr');
  const [size, setSize] = useState<PaperSize>('A4');
  const [phone, setPhone] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [o, ph] = await Promise.all([
        supabase.from('organizations').select('public_whatsapp, public_phone').eq('id', office.id).maybeSingle(),
        supabase.from('property_photos').select('id, org_id, property_id').eq('property_id', property.id)
          .order('is_cover', { ascending: false }).order('created_at').order('id'),
      ]);
      if (!live) return;
      const c = o.data as { public_whatsapp: string | null; public_phone: string | null } | null;
      setPhone(c?.public_whatsapp || c?.public_phone || null);
      setPhotos(((ph.data ?? []) as { id: string; org_id: string; property_id: string }[]).map(p => `${p.org_id}/${p.property_id}/${p.id}`));
    })();
    return () => { live = false; };
  }, [office.id, property.id]);

  const canQr = property.is_published && !!PUBLIC_SITE;
  const print = () => {
    const ok = printVitrine({ property, office: { name: office.name, slug: office.slug, phone }, photos, lang, size, published: canQr });
    setBlocked(!ok);
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${on ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line/10 hover:text-ink'}`;

  return (
    <div className="space-y-2.5 rounded-xl bg-surface-2 p-3.5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Printer className="h-4 w-4" /> {t('Window card (A4 / A3)')}</h3>
      <p className="text-xs text-muted">{t('A poster for your shop window with the photo, price, key facts and a QR code to the public page.')}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs font-semibold text-muted">{t('Language of the card')}</span>
        {(['fr', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`${pill(lang === l)} uppercase`}>{l}</button>)}
        <span className="ms-3 me-1 text-xs font-semibold text-muted">{t('Paper size')}</span>
        {(['A4', 'A3'] as const).map(s => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} className={pill(size === s)}>{s}</button>)}
      </div>
      <Btn tone="ghost" onClick={print}><Printer className="h-4 w-4" /> {t('Print window card')}</Btn>
      {!canQr && <p className="text-xs text-muted">{t('Put the public page online first: the QR code leads to it.')}</p>}
      {blocked && <p className="text-sm font-semibold text-danger">{t('Allow pop-ups to print the card.')}</p>}
      <p className="text-xs text-muted">{t('The card opens in a new window. Choose "Save as PDF" or your printer.')}</p>
    </div>
  );
}
