import { useEffect, useState } from 'react';

export type Fetched<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T | null };

// Public pages already seen in this visit. Going back or opening a property you hovered is then instant:
// the page shows what we have and quietly checks for news in the background.
const cache = new Map<string, { data: unknown; json: string; at: number }>();
const pending = new Map<string, Promise<unknown>>();
const FRESH_MS = 30_000;

function fetchInto<T>(id: string, load: () => Promise<T | null>): Promise<T | null> {
  const running = pending.get(id);
  if (running) return running as Promise<T | null>;
  const p = load().then(data => {
    if (data !== null) cache.set(id, { data, json: JSON.stringify(data), at: Date.now() });
    return data;
  }).finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

/** Load a page ahead, for example when the visitor points at or touches a property card. */
export function prefetch<T>(ns: string, key: string, load: () => Promise<T | null>) {
  const id = `${ns}:${key}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return;
  fetchInto(id, load).catch(() => { /* only a head start: the page itself tries again */ });
}

/**
 * Runs `load` again whenever `key` changes, or when the returned retry function is called.
 * With a namespace (`ns`) the result is kept for this visit, so the page can appear at once next time.
 */
export function useFetch<T>(load: () => Promise<T | null>, key: string, ns?: string): [Fetched<T>, () => void] {
  const id = ns ? `${ns}:${key}` : null;
  const [state, setState] = useState<Fetched<T>>(() => {
    const hit = id ? cache.get(id) : undefined;
    return hit ? { status: 'ready', data: hit.data as T } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const hit = id ? cache.get(id) : undefined;
    if (hit) {
      setState(s => (s.status === 'ready' && s.data === hit.data ? s : { status: 'ready', data: hit.data as T }));
      if (Date.now() - hit.at < FRESH_MS && attempt === 0) return () => { live = false; };
      // quietly check for news; only update when something really changed
      fetchInto(id!, load).then(data => {
        if (!live || data === null) return;
        const now = cache.get(id!);
        if (now && now.json !== hit.json) setState({ status: 'ready', data: now.data as T });
      }, () => { /* keep showing what we have */ });
      return () => { live = false; };
    }
    setState({ status: 'loading' });
    (id ? fetchInto(id, load) : load()).then(
      data => { if (live) setState({ status: 'ready', data }); },
      () => { if (live) setState({ status: 'error' }); },
    );
    return () => { live = false; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, () => setAttempt(n => n + 1)];
}
