import { ConflictError } from '../../common/errors/domain-error';

export type InboxPagination = { cursor?: string; limit?: number };

/** Scan candidates in bounded reads; authorization happens before the actionable page fills. */
export async function approvalInboxPage<T extends { id: string }>(
  fetch: (cursor: string | undefined, take: number) => Promise<T[]>,
  actionable: (row: T) => Promise<boolean>,
  pagination?: InboxPagination,
) {
  if (pagination?.cursor && !/^[0-9a-f-]{36}$/i.test(pagination.cursor))
    throw new ConflictError('Invalid approval cursor');
  const limit = pagination ? Math.max(1, Math.min(pagination.limit ?? 50, 100)) : Infinity;
  const items: T[] = [];
  let cursor = pagination?.cursor;
  for (;;) {
    const rows = await fetch(cursor, 200);
    for (const row of rows) {
      if (await actionable(row)) items.push(row);
      if (items.length > limit)
        return { items: items.slice(0, limit), nextCursor: items[limit - 1]!.id };
    }
    if (rows.length < 200) return { items, nextCursor: undefined };
    const next = rows.at(-1)!.id;
    if (next === cursor) throw new ConflictError('Approval paging did not advance');
    cursor = next;
  }
}
