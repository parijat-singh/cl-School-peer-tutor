// src/lib/use-poll.ts
// Polling hook that replaces Firestore onSnapshot subscriptions.
// Calls a fetcher immediately and then every `intervalMs` milliseconds.

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePollOptions {
  /** Polling interval in milliseconds (default 30_000). */
  intervalMs?: number;
  /** If false, polling is paused (useful for conditional subscriptions). */
  enabled?: boolean;
}

/**
 * Poll a data source at a fixed interval.
 *
 * @param fetcher  Async function that returns the data.
 * @param deps     Dependency array — refetches immediately when any dep changes.
 * @param options  Polling interval and enabled flag.
 * @returns        { data, loading, error, refetch }
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: UsePollOptions,
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const { intervalMs = 30_000, enabled = true } = options ?? {};
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    doFetch();

    const id = setInterval(doFetch, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, doFetch, ...deps]);

  return { data, loading, error, refetch: doFetch };
}
