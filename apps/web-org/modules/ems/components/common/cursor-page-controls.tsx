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
      className="mt-3 flex w-full flex-col items-stretch gap-3 border-t border-border px-3 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-4"
    >
      <span role="status" className="text-muted-foreground sm:flex-1">
        Page {page} · {count} records{nextCursor ? ' · more available' : ''}
        {busy ? ' · Updating…' : ''}
      </span>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || page === 1}
          onClick={previous}
          className="min-h-10 flex-1 whitespace-nowrap sm:flex-none"
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
          className="min-h-10 flex-1 whitespace-nowrap sm:flex-none"
        >
          Next page
        </Button>
      </div>
    </nav>
  );
}
