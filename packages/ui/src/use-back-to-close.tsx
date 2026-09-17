'use client';

import * as React from 'react';

/** Open overlays, oldest first. Back closes only the newest, so a dialog over a sheet goes first. */
const openOverlays: symbol[] = [];
/** An entry left by an overlay that closed a moment ago, reused if one reopens straight away. */
let pendingRelease: ReturnType<typeof setTimeout> | null = null;

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
      window.history.pushState({ emsOverlay: true }, '', window.location.href);
    }
    let closedByBack = false;
    const onPopState = () => {
      if (openOverlays[openOverlays.length - 1] !== id) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      openOverlays.splice(openOverlays.indexOf(id), 1);
      if (closedByBack) return;
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        // Only while the overlay's entry is still current: a result that navigated has moved on.
        if ((window.history.state as { emsOverlay?: boolean } | null)?.emsOverlay)
          window.history.back();
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
