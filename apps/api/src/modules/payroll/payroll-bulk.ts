/**
 * The two shapes a set-based payroll write needs.
 *
 * Both are deliberately tiny and dependency-free. They exist because the alternative — scanning a
 * collection once per employee, and issuing one statement per employee — is what made a payroll
 * run's cost grow with the square of the tenant rather than with its size.
 */

/** Indexes rows by a key, preserving the order they arrived in within each bucket. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}

/**
 * Splits rows into insert-sized batches.
 *
 * `createMany` sends every row as bind parameters in one statement, and PostgreSQL's protocol caps
 * those at 65535. A payroll line carries enough columns that a single unbounded batch would breach
 * that on a large tenant, so the write is chunked rather than trusted to fit.
 */
export function chunked<T>(rows: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('Chunk size must be at least one');
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size)
    batches.push(rows.slice(index, index + size));
  return batches;
}
