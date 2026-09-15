/**
 * The table's rules, as functions.
 *
 * Search, filter, sort, paginate and column ordering are decisions about data, not about React.
 * Keeping them here means they can be tested directly — the behaviour was previously reachable
 * only by rendering a seven-hundred-line component, so none of it was covered — and it leaves
 * `useStandardDataTable` as the state wiring it actually is.
 *
 * No imports, no React, no DOM.
 */

/**
 * The parts of a column these rules read.
 *
 * Deliberately excludes `header` and `cell`: those are React nodes, and keeping them out is what
 * lets this module stay free of React and be tested without one. `ColumnDef` in
 * `standard-data-table-model` extends this with the rendering fields.
 */
export interface TableColumn<T> {
  id: string;
  accessorKey?: keyof T | ((row: T) => unknown);
  sortable?: boolean;
  sortFn?: (a: T, b: T, direction: 'asc' | 'desc') => number;
  filterable?: boolean;
  filterOptions?: { label: string; value: string }[];
  filterFn?: (row: T, filterValue: string) => boolean;
  pinnable?: boolean;
  pinned?: 'left' | 'right' | false;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  width?: string | number;
}

export type SortState = { columnId: string; direction: 'asc' | 'desc' } | null;
export type ColumnPins = Record<string, 'left' | 'right' | false>;

/** The string form a value is searched, filtered and sorted by. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

export function getCellValue<T>(row: T, column: TableColumn<T>): unknown {
  if (typeof column.accessorKey === 'function') return column.accessorKey(row);
  if (column.accessorKey) return row[column.accessorKey];
  return '';
}

/** `ALL` is the select's "no filter" sentinel, not a value any column holds. */
const NO_FILTER = 'ALL';

export function resolveFilterOptions<T>(
  data: readonly T[],
  columns: readonly TableColumn<T>[],
): Record<string, { label: string; value: string }[]> {
  const options: Record<string, { label: string; value: string }[]> = {};
  for (const column of columns) {
    if (!column.filterable) continue;
    if (column.filterOptions) {
      options[column.id] = column.filterOptions;
      continue;
    }
    const unique = new Set<string>();
    for (const row of data) {
      const value = getCellValue(row, column);
      if (value !== null && value !== undefined && value !== '') unique.add(displayValue(value));
    }
    options[column.id] = Array.from(unique)
      .sort()
      .map((value) => ({ label: value, value }));
  }
  return options;
}

export function searchRows<T>(
  data: readonly T[],
  columns: readonly TableColumn<T>[],
  query: string,
  searchFields?: readonly (keyof T | ((row: T) => string))[],
): T[] {
  const needle = query.toLowerCase().trim();
  if (!needle) return [...data];
  return data.filter((row) => {
    // Explicit search fields win; otherwise every column's rendered text is searched, which is
    // what a user expects from a single search box over a table they can see.
    if (searchFields?.length) {
      return searchFields.some((field) => {
        const value = typeof field === 'function' ? field(row) : String(row[field] ?? '');
        return value.toLowerCase().includes(needle);
      });
    }
    return columns.some((column) =>
      displayValue(getCellValue(row, column)).toLowerCase().includes(needle),
    );
  });
}

export function applyColumnFilters<T>(
  data: readonly T[],
  columns: readonly TableColumn<T>[],
  filters: Readonly<Record<string, string>>,
): T[] {
  let rows = [...data];
  for (const [columnId, value] of Object.entries(filters)) {
    if (!value || value === NO_FILTER) continue;
    const column = columns.find((candidate) => candidate.id === columnId);
    if (!column) continue;
    rows = rows.filter((row) =>
      column.filterFn
        ? column.filterFn(row, value)
        : displayValue(getCellValue(row, column)) === value,
    );
  }
  return rows;
}

export function sortRows<T>(
  data: readonly T[],
  columns: readonly TableColumn<T>[],
  sortState: SortState,
): T[] {
  if (!sortState) return [...data];
  const column = columns.find((candidate) => candidate.id === sortState.columnId);
  if (!column) return [...data];
  const rows = [...data];
  if (column.sortFn) {
    rows.sort((a, b) => column.sortFn!(a, b, sortState.direction));
    return rows;
  }
  rows.sort((a, b) => {
    const left = getCellValue(a, column);
    const right = getCellValue(b, column);
    if (left === right) return 0;
    // Empty values sort last regardless of direction: a blank cell is absence, not a low value.
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : displayValue(left).localeCompare(displayValue(right), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
    return sortState.direction === 'asc' ? comparison : -comparison;
  });
  return rows;
}

/** Total pages for a row count, never fewer than one so the footer always has a page to show. */
export function pageCount(totalItems: number, pageSize: number): number {
  return Math.ceil(totalItems / pageSize) || 1;
}

/** Clamps a page into range, so narrowing a filter cannot strand the view on an empty page. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), totalPages);
}

export function paginate<T>(data: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

/** Left-pinned columns, then unpinned, then right-pinned — the order the header renders. */
export function orderColumns<C extends { id: string }>(
  columns: readonly C[],
  visible: Readonly<Record<string, boolean>>,
  pins: Readonly<ColumnPins>,
): C[] {
  const shown = columns.filter((column) => visible[column.id]);
  return [
    ...shown.filter((column) => pins[column.id] === 'left'),
    ...shown.filter((column) => !pins[column.id]),
    ...shown.filter((column) => pins[column.id] === 'right'),
  ];
}

/** Ascending, then descending, then unsorted. */
export function nextSortState(previous: SortState, columnId: string): SortState {
  if (previous?.columnId !== columnId) return { columnId, direction: 'asc' };
  if (previous.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

/** Unpinned, then left, then right, then unpinned again. */
export function nextPinState(previous: ColumnPins, columnId: string): ColumnPins {
  const current = previous[columnId];
  if (!current) return { ...previous, [columnId]: 'left' };
  if (current === 'left') return { ...previous, [columnId]: 'right' };
  return { ...previous, [columnId]: false };
}

export function hasActiveFilters(
  searchQuery: string,
  filters: Readonly<Record<string, string>>,
): boolean {
  return (
    searchQuery.trim() !== '' ||
    Object.values(filters).some((value) => value && value !== NO_FILTER)
  );
}
