import * as React from 'react';

/**
 * A popover panel anchored to a trigger, positioned in viewport coordinates.
 *
 * Every dropdown in this kit was laid out `absolute` inside its trigger, which is correct until
 * the trigger sits in something that scrolls. Then the panel is clipped at that box's edge and
 * widens its scroll area — which is how a calendar ended up cut in half inside a dialog, with a
 * horizontal scrollbar across the form underneath it.
 *
 * The caller renders the panel into a portal on `document.body` and applies the returned
 * `position` with `position: fixed`. Nothing can clip it then, because it is no longer inside
 * anything.
 *
 * The panel flips above the trigger, and shifts left, only when it would otherwise leave the
 * viewport — so the ordinary case stays directly under the field where the eye expects it.
 */

const GAP = 6;
const VIEWPORT_MARGIN = 8;

export type PanelPosition = { left: number; top: number };

export function anchorPanel(
  trigger: DOMRect,
  size: { width: number; height: number },
): PanelPosition {
  const below = trigger.bottom + GAP;
  const flipUp =
    below + size.height > window.innerHeight - VIEWPORT_MARGIN &&
    trigger.top - GAP - size.height > VIEWPORT_MARGIN;

  return {
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, trigger.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN),
    ),
    top: flipUp ? trigger.top - GAP - size.height : below,
  };
}

/**
 * Tracks where an open panel should sit.
 *
 * Returns null while closed, and while open re-measures on scroll and resize: a fixed panel does
 * not travel with a scrolling ancestor by itself, so without that it would visibly detach from
 * the control it belongs to.
 */
export function useAnchoredPanel(
  isOpen: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  size: { width: number; height: number },
): PanelPosition | null {
  const [position, setPosition] = React.useState<PanelPosition | null>(null);
  const { width, height } = size;

  const reposition = React.useCallback(() => {
    const trigger = anchorRef.current?.getBoundingClientRect();
    if (trigger) setPosition(anchorPanel(trigger, { width, height }));
  }, [anchorRef, width, height]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    reposition();
    // `true` for the capture phase: the scroll that moves the trigger is usually on an ancestor,
    // and scroll events do not bubble.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen, reposition]);

  return position;
}

/**
 * Closes on a click outside both the trigger and the panel.
 *
 * The panel is portalled, so it is not a descendant of the trigger any more — without naming it
 * here, clicking an option would count as an outside click and close the panel before the click
 * registered, making the control impossible to use.
 */
export function useDismissOnOutside(
  isOpen: boolean,
  refs: Array<React.RefObject<HTMLElement | null>>,
  onDismiss: () => void,
) {
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
    // `refs` is a fresh array literal each render at every call site; its contents are stable and
    // are what matter, so depending on the array identity would re-subscribe on every render.
  }, [isOpen, onDismiss]);
}
