import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy as CopyIcon, Gauge } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';
import type { Office, PropertyRow } from '../lib/types';
import { adQuality, missing } from '../lib/adQuality';
import { analyzeImage, type ImageStats } from '../lib/photoTools';
import { photoUrl } from '../lib/photos';
import { findDuplicates, type DupRow } from '../lib/duplicates';

/** On a property: how good the ad is (0 to 100), what to fix first, and a warning when the same property seems to be in the list twice. */
export function AdQuality({ office, property, tick }: { office: Office; property: PropertyRow; tick: number }) {
  const [count, setCount] = useState<number | null>(null);
  const [stats, setStats] = useState<ImageStats[] | null>(null);
  const [dups, setDups] = useState<DupRow[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.from('property_photos').select('id, org_id, property_id')
        .eq('property_id', property.id).order('is_cover', { ascending: false }).order('created_at').order('id');
      if (!live) return;
      const list = (r.data ?? []) as { id: string; org_id: string; property_id: string }[];
      setCount(list.length);
      setStats(null);
      const all = await Promise.all(list.slice(0, 8).map(x => analyzeImage(photoUrl(`${x.org_id}/${x.property_id}/${x.id}`, true))));
      if (live) setStats(all.filter((x): x is ImageStats => x !== null));
    })();
    return () => { live = false; };
  }, [property.id, tick]);

  useEffect(() => {
    let live = true;
    findDuplicates(office.id, property).then(d => { if (live) setDups(d); });
    return () => { live = false; };
  }, [office.id, property]);

  const q = useMemo(() => (count === null ? null : adQuality(property, count, stats)), [property, count, stats]);
  if (!q) return null;
  const todo = missing(q);
  const tone = q.level === 'good' ? 'bg-ok' : q.level === 'ok' ? 'bg-warn' : 'bg-danger';
  const label = q.level === 'good' ? t('Strong ad') : q.level === 'ok' ? t('Almost there') : t('Weak ad');

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4" /> {t('Ad quality')}</h3>
      <div className="space-y-3 rounded-2xl bg-surface-2 p-3.5">
        <div className="flex items-center gap-3">
          <span className="tabular font-display text-3xl font-bold">{q.score}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{label}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3"><div className={`h-full ${tone}`} style={{ width: `${q.score}%` }} /></div>
          </div>
        </div>
        {todo.length === 0
          ? <p className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 className="h-4 w-4" /> {t('Everything is in place. This ad is ready to post.')}</p>
          : <ul className="space-y-1.5">
              {todo.slice(0, 5).map(i => (
                <li key={i.key} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><span>{i.tip}</span></li>
              ))}
            </ul>}
        {stats === null && count! > 0 && <p className="text-xs text-muted">{t('Checking the photos…')}</p>}
        {dups.length > 0 && (
          <div className="rounded-xl bg-warn/10 px-3 py-2 text-sm">
            <p className="flex items-center gap-1.5 font-semibold"><CopyIcon className="h-4 w-4" /> {t('This may be a duplicate')}</p>
            <p className="mt-0.5 text-muted">{dups.map(d => `${d.reference} · ${d.title}`).join(' | ')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
