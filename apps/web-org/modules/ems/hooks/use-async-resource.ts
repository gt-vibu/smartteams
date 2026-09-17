'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api-client';

export type ResourceState<T> = {
  data: T | null;
  /** True only on the first load, so a refetch does not blank an already-rendered screen. */
  loading: boolean;
  /** True while a background refetch is in flight. */
  refreshing: boolean;
  error: string | null;
  /** Set when the failure was an authorization one, so the UI can say so specifically. */
  forbidden: boolean;
  refetch: () => Promise<void>;
};

/**
 * Loads a server resource and exposes the states every wired screen has to handle.
 *
 * There is deliberately no fallback to fixture data: when the request fails, `data` stays null
 * and `error` is set, so the screen renders its error state rather than presenting invented
 * records as though they came from the server.
 *
 * `enabled` defers the request until its inputs exist — typically the organization id, which is
 * only known once the session has been restored.
 */
export function useAsyncResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): ResourceState<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Held in a ref so `refetch` stays stable while still calling the latest loader.
  const loadRef = useRef(load);
  loadRef.current = load;

  const hasLoaded = useRef(false);

  const run = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      setData(await loadRef.current());
      hasLoaded.current = true;
    } catch (caught) {
      setData(null);
      setForbidden(caught instanceof ApiError && caught.status === 403);
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // `deps` is spread so the caller controls what triggers a reload — typically the organization
  // id and any filter the request depends on.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void run(hasLoaded.current);
  }, [enabled, run, ...deps]);

  const refetch = useCallback(() => run(true), [run]);

  return { data, loading, refreshing, error, forbidden, refetch };
}
