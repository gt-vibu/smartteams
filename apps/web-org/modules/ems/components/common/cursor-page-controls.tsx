'use client';

import { Button } from '@smarteam/ui';

export function CursorPageControls({
  page,
  count,
  nextCursor,
  busy,
  previous,
  next,
}: {
  page: number;
  count: number;
  nextCursor?: string;
  busy: boolean;
  previous: () => void;
  next: (cursor: string) => void;
}) {
  return (
    <nav
      aria-label="Record pages"
      className="flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <span role="status" className="text-muted-foreground">
        Page {page} · {count} records{nextCursor ? ' · more available' : ''}
        {busy ? ' · Updating…' : ''}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || page === 1}
          onClick={previous}
        >
          Previous page
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !nextCursor}
          onClick={() => {
            if (nextCursor) next(nextCursor);
          }}
        >
          Next page
        </Button>
      </div>
    </nav>
  );
}
