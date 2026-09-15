'use client';

import React from 'react';

/**
 * What a screen shows when it has nothing to show.
 *
 * This markup was written out by hand in more than twenty places as
 * `rounded-lg border border-border bg-card p-10 text-center`, which had two consequences. The
 * copies drifted — `rounded-lg` against `rounded-xl`, `p-10` against `p-8`, some with a shadow —
 * so the same "nothing here yet" moment looked different depending on which screen you were on.
 * And every copy was a 120px strip pinned to the top of an 850px canvas, which is what made a
 * new tenant look like a set of small boxes adrift in empty pages rather than an application
 * waiting for data.
 *
 * The message now sits in a region proportional to the space it occupies, centred in it. The
 * page still reads as empty — it is — but as a page that is empty, not as a stray card.
 */
export function EmptyState({
  action,
  detail,
  role = 'status',
  title,
}: {
  /** A single primary action, when there is an obvious way to fill the emptiness. */
  action?: React.ReactNode;
  detail?: string;
  /** `alert` when the emptiness is a failure rather than an absence. */
  role?: 'status' | 'alert';
  title: string;
}) {
  return (
    <div
      className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
      role={role}
    >
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
