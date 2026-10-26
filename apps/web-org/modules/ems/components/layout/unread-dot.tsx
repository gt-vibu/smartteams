import React from 'react';

/**
 * A small dot on a navigation item with something unread about it. It goes when the screen is
 * opened, which reads those notifications. Screen readers hear "new" after the item's name.
 */
export function UnreadDot({
  className = '',
  ring = 'ring-card',
}: {
  className?: string;
  /** Matches the surface behind the dot, so it reads as cut out of it. */
  ring?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        data-unread-dot=""
        className={`pointer-events-none absolute size-2 rounded-full bg-destructive ring-2 ${ring} ${className}`}
      />
      <span className="sr-only">, new</span>
    </>
  );
}
