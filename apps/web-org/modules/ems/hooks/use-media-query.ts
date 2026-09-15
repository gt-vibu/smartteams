'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept in step with the viewport.
 *
 * For choosing *what* a screen shows at a size — which tab is the default, whether two columns
 * exist at all — where CSS can only restyle what is already there. Styling alone should stay in
 * Tailwind breakpoints.
 *
 * The server has no viewport, so it renders as `serverDefault` and the client corrects after
 * hydration. Pick the default that is the smaller surprise if it shows for a frame.
 */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}

/**
 * The width at which the workspace stops being a phone layout: the Home screen's profile column
 * and content column sit side by side from here, and stack below it.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';
