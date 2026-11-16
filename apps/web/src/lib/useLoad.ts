import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

/**
 * Load data on mount and whenever `key` changes; `reload` refetches.
 * Responses from superseded requests are ignored.
 */
export function useLoad<T>(fn: () => Promise<T>, key = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  const reload = useCallback(async () => {
    const id = ++run.current;
    setLoading(true);
    try {
      const value = await latest.current();
      if (id === run.current) {
        setData(value);
        setError(null);
      }
    } catch (err) {
      if (id === run.current) setError(errorMessage(err));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Starts a fetch; its results land via setState after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload, key]);

  return { data, error, loading, reload, setData };
}
