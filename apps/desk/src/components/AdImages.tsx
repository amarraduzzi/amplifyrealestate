import { useEffect, useState } from 'react';
import { Download, Images, Sparkles } from 'lucide-react';
import { t } from '../lib/i18n';
import type { PropertyRow } from '../lib/types';
import type { AdLang, Site } from '../lib/postings';
import { makeCard, makePhoto, saveBlob, type CardFormat } from '../lib/adCards';
import { Btn } from './ui';

const FORMAT_LABEL = (f: CardFormat) =>
  f === 'original' ? t('Original') : f === 'market' ? t('Marketplace 4:3') : f === 'post' ? t('Post 4:5') : t('Story 9:16');

/** Photos and image cards for an ad: pick the shape, brighten dark photos, download one by one. */
export function AdImages({ property, site, social, lang, photos, office }: {
  property: PropertyRow; site: Site; social: boolean; lang: AdLang; photos: string[]; office: { name: string; phone: string | null };
}) {
  const [format, setFormat] = useState<CardFormat>('market');
  const [improve, setImprove] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setFormat(site === 'instagram' ? 'post' : site === 'facebook' ? 'market' : 'original'); }, [site]);

  const run = async (label: string, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError(null);
    try { await job(); } catch { setError(t('A photo could not be downloaded. Try again.')); }
    setBusy(null);
  };

  const photoFiles = () => run(t('Preparing…'), async () => {
    for (let i = 0; i < photos.length; i++) {
      setBusy(t('Downloading {i} of {n}…', { i: i + 1, n: photos.length }));
      saveBlob(await makePhoto(photos[i], format, improve), `${property.reference}-${i + 1}.jpg`);
    }
  });
  const cardFormat = (format === 'original' ? 'market' : format) as Exclude<CardFormat, 'original'>;
  const card = () => run(t('Preparing…'), async () => {
    saveBlob(await makeCard(photos[0] ?? null, property, lang, office, cardFormat, improve), `${property.reference}-card.jpg`);
  });
  const carousel = () => run(t('Preparing…'), async () => {
    const list = photos.slice(1, 10);
    saveBlob(await makeCard(photos[0] ?? null, property, lang, office, cardFormat, improve), `${property.reference}-1-card.jpg`);
    for (let i = 0; i < list.length; i++) {
      setBusy(t('Downloading {i} of {n}…', { i: i + 2, n: list.length + 1 }));
      saveBlob(await makePhoto(list[i], cardFormat, improve), `${property.reference}-${i + 2}.jpg`);
    }
  });

  return (
    <div className="space-y-2.5 rounded-xl bg-surface p-3 ring-1 ring-line/10">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><Images className="h-3.5 w-3.5" /> {t('Photos and image cards')}</p>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Shape of the images')}>
        {(['original', 'market', 'post', 'story'] as const).map(f => (
          <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${format === f ? 'bg-ink text-bg' : 'bg-surface-2 text-muted ring-1 ring-line/10 hover:text-ink'}`}>{FORMAT_LABEL(f)}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={improve} onChange={e => setImprove(e.target.checked)} className="h-4 w-4" />
        <Sparkles className="h-3.5 w-3.5" /> {t('Brighten dark photos and improve contrast')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Btn tone="ghost" disabled={photos.length === 0 || busy !== null} onClick={photoFiles}>
          <Download className="h-4 w-4" /> {busy ?? (photos.length ? t('Download {n} photos', { n: photos.length }) : t('No photos yet'))}
        </Btn>
        {social && (
          <>
            <Btn tone="ghost" disabled={busy !== null} onClick={card}>{t('Download image card')}</Btn>
            <Btn tone="ghost" disabled={busy !== null || photos.length < 2} onClick={carousel}>{t('Download carousel')}</Btn>
          </>
        )}
      </div>
      {social && <p className="text-xs text-muted">{t('The card shows the cover photo with the price, the key facts, the place and your office. The carousel is the card followed by the other photos in the same shape.')}</p>}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
