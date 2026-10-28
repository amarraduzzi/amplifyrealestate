import { useEffect, useRef, useState } from 'react';
import { Camera, Check, MapPin } from 'lucide-react';
import { loadCleanerPage, markCleaned, type CleanerTask } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { getLang, LOCALE, LANGS, t } from '../lib/i18n';
import { Layout } from '../components/Layout';
import { Failed, Loading, NotFound } from './States';

const day = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const when = (d: string) => new Intl.DateTimeFormat(LOCALE[getLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const today = () => new Date().toISOString().slice(0, 10);

/** Shrinks a photo in the browser to a small jpeg (base64, no prefix) of at most about 200 KB. */
async function shrink(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    for (const [max, q] of [[960, 0.6], [720, 0.5], [560, 0.45]] as const) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', q);
      const b64 = url.slice(url.indexOf(',') + 1);
      if (b64.length <= 280_000) return b64;
    }
  } catch { /* not an image the browser can read */ }
  return null;
}

function TaskCard({ task, token, onDone }: { task: CleanerTask; token: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const late = task.due_date < today();
  const place = [task.neighborhood, task.city].filter(Boolean).join(', ');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const b = await shrink(f);
    if (b) { setPhoto(b); setError(null); } else setError(t('This photo cannot be used. Try another one.'));
  };
  const confirm = async () => {
    setBusy(true); setError(null);
    const ok = await markCleaned(token, task.id, note, photo);
    setBusy(false);
    if (ok) onDone(); else setError(t('Something went wrong. Please try again.'));
  };

  return (
    <li className="card rise rounded-3xl p-4">
      <p className={`text-xs font-bold ${late ? 'text-danger' : 'text-brand'}`}>{day(task.due_date)}{late ? ` · ${t('Late')}` : ''}</p>
      <h2 className="font-display mt-0.5 text-lg font-bold leading-snug">{task.title}</h2>
      {(place || task.address_note) && <p className="mt-1 flex items-start gap-1.5 text-sm text-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{[place, task.address_note].filter(Boolean).join(' · ')}</span></p>}
      <p className="mt-1 text-sm">{task.next_arrival ? t('Next guest arrives {date}', { date: day(task.next_arrival) }) : t('No arrival booked yet')}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="gold-fill mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-ink active:scale-[.98]"><Check className="h-4 w-4" /> {t('Done')}</button>
      ) : (
        <div className="mt-3 space-y-3">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500} placeholder={t('A note (broken, missing, to buy…)')}
            className="w-full rounded-xl border border-line/[0.12] bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
          <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pick(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-line/[0.12] bg-surface px-4 py-2.5 text-sm font-semibold"><Camera className="h-4 w-4" /> {photo ? t('Change the photo') : t('Add a photo')}</button>
            {photo && <img src={`data:image/jpeg;base64,${photo}`} alt="" className="h-12 w-12 rounded-lg object-cover" />}
          </div>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={confirm} disabled={busy} className="gold-fill inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-ink active:scale-[.98] disabled:opacity-50"><Check className="h-4 w-4" /> {t('Confirm: cleaning done')}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold">{t('Cancel')}</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** The cleaner's list behind a private link: only the cleanings of their properties, each one marked done with a photo. */
export function CleanerPage({ token }: { token: string }) {
  const [state, retry] = useFetch(() => loadCleanerPage(token), token);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    document.title = data ? `${t('Cleaning')} · ${data.office.name}` : 'Amplify Real Estate';
    let m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex, nofollow');
  }, [data]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <Failed onRetry={retry} />;
  if (!data) return <NotFound text={t('This link is no longer valid. Ask your agency for a new one.')} />;

  const first = data.cleaner.trim().split(/\s+/)[0] ?? '';
  return (
    <Layout office={data.office} langs={LANGS}>
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-5 sm:py-8">
        <h1 className="font-display text-2xl font-bold">{t('Hello {name}', { name: first })}</h1>
        <p className="text-sm text-muted">{t('Your cleanings. Tap “Done” when a property is clean.')}</p>
        {data.tasks.length === 0
          ? <p className="card rounded-3xl p-5 text-center text-sm text-muted">{t('Nothing to clean right now.')}</p>
          : <ul className="space-y-3">{data.tasks.map(x => <TaskCard key={x.id} task={x} token={token} onDone={retry} />)}</ul>}
        {data.done.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted">{t('Done recently')}</h2>
            <ul className="mt-2 divide-y divide-line/[0.07] rounded-2xl bg-surface-2 px-3 text-sm">
              {data.done.map((d, i) => <li key={i} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{d.title}</span><span className="shrink-0 text-xs text-muted">{when(d.done_at)}</span></li>)}
            </ul>
          </section>
        )}
      </div>
    </Layout>
  );
}
