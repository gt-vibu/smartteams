import { decodePayrollCursor, encodePayrollCursor } from './payroll-shared';

/**
 * Keyset paging for the payroll lists that grew without bound.
 *
 * Salary advances and payroll payments were returned whole: every advance ever raised, or every
 * payment ever marked, in one response and one query. Both only ever grow, and payments grow by
 * one row per employee per run. The native routes now read a page at a time, in the envelope the
 * ledger and employee lists already use.
 *
 * Federation calls the same service methods without a page and keeps the bare array its partners
 * were built against: that contract is frozen, so it is left exactly as it was.
 */
export type ListPage = { limit?: number; cursor?: string };

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

export function pageSize(page: ListPage): number {
  return Math.min(Math.max(page.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

/** The Prisma arguments for one page: one row more than asked, to learn whether another follows. */
export function pageArgs(page: ListPage) {
  const cursorId = page.cursor ? decodePayrollCursor(page.cursor) : undefined;
  return {
    take: pageSize(page) + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(rows: T[], page: ListPage) {
  const limit = pageSize(page);
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? encodePayrollCursor(items.at(-1)?.id) : undefined,
  };
}
