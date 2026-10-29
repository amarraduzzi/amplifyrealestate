import { Heart } from 'lucide-react';
import { toggleFav, useFavs } from '../lib/favorites';
import { t } from '../lib/i18n';

/** The heart: on a card (round, over the photo) or on the property page (with text). */
export function FavButton({ slug, reference, variant = 'card' }: { slug: string; reference: string; variant?: 'card' | 'page' }) {
  const on = useFavs(slug).includes(reference);
  const label = on ? t('Remove from favorites') : t('Save to favorites');
  const click = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggleFav(slug, reference); };

  if (variant === 'page') {
    return (
      <button type="button" onClick={click} aria-pressed={on}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 transition ${on ? 'bg-rose-50 text-rose-600 ring-rose-200' : 'bg-surface text-ink ring-line/15 hover:ring-line/30'}`}>
        <Heart className={`h-4 w-4 ${on ? 'fill-current' : ''}`} /> {on ? t('Saved') : t('Save')}
      </button>
    );
  }
  return (
    <button type="button" onClick={click} aria-pressed={on} aria-label={label} title={label}
      className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-night shadow-sm transition hover:scale-105 active:scale-95">
      <Heart className={`h-[18px] w-[18px] transition ${on ? 'fill-rose-500 text-rose-500' : ''}`} />
    </button>
  );
}
