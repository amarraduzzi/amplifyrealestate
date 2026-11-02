import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { photoUrl } from './photos';

// property id -> small cover photo. Only photos that exist are remembered, so a photo added later shows up on the next visit.
const known = new Map<string, string>();

/** The small cover photo of each given property (the cover first, otherwise the oldest). Properties without a photo are left out. */
export function useCovers(ids: string[]): Record<string, string> {
  const key = Array.from(new Set(ids)).sort().join(',');
  const [, bump] = useState(0);
  useEffect(() => {
    const want = (key ? key.split(',') : []).filter(id => !known.has(id));
    if (want.length === 0) return;
    let live = true;
    (async () => {
      for (let i = 0; i < want.length; i += 100) {
        const { data } = await supabase.from('property_photos').select('id, org_id, property_id, is_cover')
          .in('property_id', want.slice(i, i + 100)).order('is_cover', { ascending: false }).order('created_at').order('id');
        for (const x of (data ?? []) as { id: string; org_id: string; property_id: string }[]) {
          if (!known.has(x.property_id)) known.set(x.property_id, photoUrl(`${x.org_id}/${x.property_id}/${x.id}`, true));
        }
      }
      if (live) bump(n => n + 1);
    })();
    return () => { live = false; };
  }, [key]);
  const out: Record<string, string> = {};
  for (const id of key ? key.split(',') : []) { const u = known.get(id); if (u) out[id] = u; }
  return out;
}
