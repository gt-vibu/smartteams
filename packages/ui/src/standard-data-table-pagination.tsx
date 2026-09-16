'use client';

import { Button } from './button';
import { Select } from './select';

export interface StandardDataTablePaginationProps {
  totalItems: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  rowsPerPageOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function StandardDataTablePagination({
  totalItems,
  currentPage,
  totalPages,
  pageSize,
  rowsPerPageOptions,
  onPageChange,
  onPageSizeChange,
}: StandardDataTablePaginationProps) {
  const firstItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const buttonClassName = 'h-8 w-8 border border-border shadow-2xs';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 p-3 text-xs font-medium text-muted-foreground sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          Showing <span className="font-bold text-foreground">{firstItem}</span> to{' '}
          <span className="font-bold text-foreground">{lastItem}</span> of{' '}
          <span className="font-bold text-foreground">{totalItems}</span> entries
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground/60">|</span>
          <span className="text-muted-foreground">Rows:</span>
          <div className="w-20">
            <Select
              value={String(pageSize)}
              aria-label="Rows per page"
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {rowsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="First page"
          title="First page"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          className={buttonClassName}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous page"
          title="Previous page"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className={buttonClassName}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <span className="px-2.5 py-1 text-xs font-semibold text-table-header-foreground">
          Page <span className="font-bold text-foreground">{currentPage}</span> of{' '}
          <span className="font-bold text-foreground">{totalPages}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next page"
          title="Next page"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className={buttonClassName}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Last page"
          title="Last page"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className={buttonClassName}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
