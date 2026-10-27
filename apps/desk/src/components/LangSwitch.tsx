import { getLang, saveLang, type Lang } from '../lib/i18n';

const OPTIONS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'FR' },
  { id: 'ar', label: 'AR' },
  { id: 'en', label: 'EN' },
];

/** Language of the app. The choice is remembered on this device; the page reloads so every text and the direction change at once. */
export function LangSwitch({ light = false }: { light?: boolean }) {
  const cur = getLang();
  const pick = (l: Lang) => {
    if (l === cur) return;
    saveLang(l);
    // Drop ?lang= from the address so it does not override the choice after the reload.
    const u = new URL(window.location.href);
    u.searchParams.delete('lang');
    window.location.replace(u.toString());
  };
  return (
    <div className="flex items-center gap-0.5 rounded-full p-0.5" dir="ltr" role="group" aria-label="Language">
      {OPTIONS.map(o => (
        <button key={o.id} type="button" onClick={() => pick(o.id)} aria-pressed={o.id === cur}
          className={`rounded-full px-2 py-1 text-[11px] font-bold transition ${
            o.id === cur
              ? (light ? 'bg-ink text-bg' : 'bg-white text-night')
              : (light ? 'text-muted hover:text-ink' : 'text-white/70 hover:text-white')}`}>{o.label}</button>
      ))}
    </div>
  );
}
