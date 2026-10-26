'use client';

import * as React from 'react';

/** Open overlays, oldest first. Back closes only the newest, so a dialog over a sheet goes first. */
const openOverlays: symbol[] = [];
/** An entry left by an overlay that closed a moment ago, reused if one reopens straight away. */
let pendingRelease: ReturnType<typeof setTimeout> | null = null;
/**
 * Set while a closed overlay steps back over its own history entry, so the pop that step causes
 * does not close the overlay below it. A flag raised before `back()` rather than a marker added to
 * the event: browsers do not reliably run a marking listener ahead of the overlays' own, and the
 * overlay underneath then closed along with the one on top.
 */
let releasing = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function releaseHistoryEntry(): void {
  releasing = true;
  const done = () => {
    // After every listener has seen this pop.
    setTimeout(() => {
      releasing = false;
    }, 0);
    if (releaseTimer) clearTimeout(releaseTimer);
  };
  window.addEventListener('popstate', done, { once: true });
  // `back()` is a no-op at the start of a history stack, so no pop may arrive: never leave the
  // flag up for a later, real Back.
  releaseTimer = setTimeout(() => {
    window.removeEventListener('popstate', done);
    releasing = false;
  }, 1_000);
  window.history.back();
}

/**
 * Makes the phone's Back button close an open overlay instead of leaving the page beneath it.
 *
 * Opening pushes a history entry, so Back pops that entry and closes the overlay. Closing any
 * other way (a close button, choosing a result) steps back over the entry, so the next Back is not
 * spent on an overlay that is already gone. That step waits a tick: React's dev-mode remount
 * closes and reopens at once, and reusing the entry then keeps history from tangling.
 */
export function useBackToClose(isOpen: boolean, onClose: () => void): void {
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  });

  React.useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const id = Symbol('overlay');
    openOverlays.push(id);
    if (pendingRelease) {
      clearTimeout(pendingRelease);
      pendingRelease = null;
    } else {
      const currentState: unknown = window.history.state;
      window.history.pushState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
          emsOverlay: true,
        },
        '',
        window.location.href,
      );
    }
    let closedByBack = false;
    const onPopState = () => {
      if (releasing) return;
      if (openOverlays[openOverlays.length - 1] !== id) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      const index = openOverlays.indexOf(id);
      if (index >= 0) openOverlays.splice(index, 1);
      if (closedByBack) return;
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        // Only while the overlay's entry is still current: a result that navigated has moved on.
        if ((window.history.state as { emsOverlay?: boolean } | null)?.emsOverlay)
          releaseHistoryEntry();
      }, 0);
    };
  }, [isOpen]);
}

type RootProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

/** Wraps a Radix root so a controlled overlay closes on Back. Uncontrolled ones are left alone. */
export function withBackToClose<P extends RootProps>(Root: React.ComponentType<P>) {
  function BackClosingRoot(props: P) {
    const { open, onOpenChange } = props;
    useBackToClose(Boolean(open && onOpenChange), () => onOpenChange?.(false));
    return <Root {...props} />;
  }
  BackClosingRoot.displayName = `BackToClose(${Root.displayName ?? 'Root'})`;
  return BackClosingRoot;
}
