import { useEffect, useState } from 'react';

export type Fetched<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T | null };

/** Runs `load` again whenever `key` changes, or when the returned retry function is called. */
export function useFetch<T>(load: () => Promise<T | null>, key: string): [Fetched<T>, () => void] {
  const [state, setState] = useState<Fetched<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load().then(
      data => { if (live) setState({ status: 'ready', data }); },
      () => { if (live) setState({ status: 'error' }); },
    );
    return () => { live = false; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, () => setAttempt(n => n + 1)];
}
