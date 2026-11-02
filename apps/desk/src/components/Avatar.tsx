/** Round avatar with the initials of a person. The color follows the id, so a person always has the same one. */
const TONES = ['bg-night text-white', 'bg-ok/15 text-ok', 'bg-qr/15 text-qr', 'bg-warn/15 text-warn', 'bg-surface-3 text-ink'];

export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, id, className = '' }: { name: string | null | undefined; id: string; className?: string }) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (
    <span aria-hidden="true" className={`font-display grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${TONES[h % TONES.length]} ${className}`}>
      {initials(name)}
    </span>
  );
}
