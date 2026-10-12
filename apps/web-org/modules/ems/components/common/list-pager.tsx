'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** How many rows a paged list shows at once. */
export const PAGE_SIZE = 25;

/**
 * Page controls for a list that is held in full in the browser.
 *
 * A directory of a few hundred people rendered every row at once: a long scroll on a desktop and
 * an unusable one on a phone. Nothing about the data changes — the filters still search the whole
 * list — only how much of the result is on screen at a time.
 */
export function ListPager({
  page,
  pageCount,
  total,
  onPage,
  noun,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  if (pageCount <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <nav
      aria-label="List pages"
      className="flex w-full flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p role="status" className="text-[11px] text-muted-foreground">
        {from}–{to} of {total} {noun}
      </p>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
        <Button
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-[11px] font-semibold text-foreground">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
