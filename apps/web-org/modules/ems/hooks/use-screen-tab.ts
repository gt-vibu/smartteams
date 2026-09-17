'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A screen's active tab, kept in the URL so Back steps through it.
 *
 * Tabs were local `useState`, which made the browser's Back button skip them entirely: opening
 * Payroll, moving through its three tabs and pressing Back left the payroll screen altogether
 * rather than returning to the previous tab. Three deliberate navigations produced one history
 * entry, so Back undid all of them at once.
 *
 * Putting the tab in the query string fixes that and two related things for free: a tab is now
 * linkable, and a reload keeps you where you were.
 *
 * The value is validated against the tabs the screen actually has. A hand-edited or stale URL
 * falls back to the default rather than rendering an empty screen — the query string is user
 * input, and a screen must not trust it to name one of its own views.
 */
export function useScreenTab<T extends string>(
  /** The query parameter to use. `tab` for a screen's primary tabs. */
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const read = useCallback((): T => {
    if (typeof window === 'undefined') return fallback;
    const value = new URLSearchParams(window.location.search).get(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
    // `allowed` is deliberately not a dependency: it is a literal array at every call site, so a
    // fresh identity each render would make this callback — and the effect below — unstable. Its
    // contents are what matter, and a screen does not change which tabs it has at runtime.
  }, [key, fallback]);

  const [tab, setTabState] = useState<T>(read);

  // The URL is the source of truth, so Back, Forward and a pasted link all arrive the same way.
  useEffect(() => {
    const onPopState = () => setTabState(read());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [read]);

  // A module change clears the tab parameter, so re-read when it disappears underneath us —
  // otherwise leaving a screen and returning would show the tab from last time.
  useEffect(() => {
    const current = read();
    if (current !== tab) setTabState(current);
    // Runs on every render on purpose: there is no event for "another hook rewrote the query
    // string", and the comparison makes a no-op cheap.
  });

  const setTab = useCallback(
    (next: T) => {
      setTabState(next);
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      // Every other parameter is preserved: the space and module live here too, and rebuilding
      // the query from this hook alone would drop them.
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const query = params.toString();
      window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
    },
    [fallback, key],
  );

  return [tab, setTab];
}
