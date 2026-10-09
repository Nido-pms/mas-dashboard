import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../api/client';

export interface ReportState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: Date | null;
  reload: () => Promise<void>;
}

/**
 * Load a report whenever `query` changes (pass a memoised object); a newer request cancels the one in flight.
 * `fetcher` must be a stable function, e.g. defined at module level.
 * Data is dropped as soon as the query changes, so the page (and its CSV) never shows rows of the previous filters.
 */
export function useReport<Q, T>(query: Q | null, fetcher: (q: Q, signal: AbortSignal) => Promise<T>): ReportState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const shown = useRef<Q | null>(null);  // query the current data belongs to

  const reload = useCallback(async () => {
    if (!query) return;
    inFlight.current?.abort();
    const me = (inFlight.current = new AbortController());
    if (shown.current !== query) {
      shown.current = query;
      setData(null);
      setUpdatedAt(null);
    }
    setLoading(true);
    try {
      setData(await fetcher(query, me.signal));
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      if (!isAbortError(e)) setError(errorMessage(e));
    } finally {
      if (inFlight.current === me) setLoading(false);
    }
  }, [query, fetcher]);

  useEffect(() => {
    void reload();
    return () => inFlight.current?.abort();
  }, [reload]);

  return { data, error, loading, updatedAt, reload };
}
