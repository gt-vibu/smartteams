/**
 * State wiring for `StandardDataTable`.
 *
 * The rules themselves — search, filter, sort, paginate, column order — live in
 * `standard-data-table-logic`, which has no React and is tested directly. What remains here is
 * the part that genuinely needs hooks: holding the user's choices and recomputing when they change.
 *
 * The component's public props are unchanged; this split is internal.
 */
import React, { useMemo, useState } from 'react';
import {
  applyColumnFilters,
  clampPage,
  displayValue,
  getCellValue,
  hasActiveFilters,
  nextPinState,
  nextSortState,
  orderColumns,
  pageCount,
  paginate,
  resolveFilterOptions,
  searchRows,
  sortRows,
  type ColumnPins,
  type SortState,
  type TableColumn,
} from './standard-data-table-logic';

export { displayValue };

/** A column, including the React it renders. The rules operate on the `TableColumn` half. */
export interface ColumnDef<T> extends TableColumn<T> {
  header: React.ReactNode;
  cell?: (row: T, index: number) => React.ReactNode;
}

export interface StandardDataTableModelOptions<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchFields?: (keyof T | ((row: T) => string))[];
  initialRowsPerPage?: number;
  defaultSort?: { columnId: string; direction: 'asc' | 'desc' } | undefined;
}

export function useStandardDataTable<T>({
  data,
  columns: initialColumns,
  searchFields,
  initialRowsPerPage = 10,
  defaultSort,
}: StandardDataTableModelOptions<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortState, setSortState] = useState<SortState>(defaultSort ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialRowsPerPage);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

  const [columnPins, setColumnPins] = useState<ColumnPins>(() => {
    const pins: ColumnPins = {};
    for (const column of initialColumns) if (column.pinned) pins[column.id] = column.pinned;
    return pins;
  });

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const visible: Record<string, boolean> = {};
    for (const column of initialColumns) visible[column.id] = true;
    return visible;
  });

  const resolvedFilterOptions = useMemo(
    () => resolveFilterOptions(data, initialColumns),
    [data, initialColumns],
  );

  const filteredData = useMemo(
    () =>
      applyColumnFilters(
        searchRows(data, initialColumns, searchQuery, searchFields),
        initialColumns,
        columnFilters,
      ),
    [data, initialColumns, searchQuery, searchFields, columnFilters],
  );

  const sortedData = useMemo(
    () => sortRows(filteredData, initialColumns, sortState),
    [filteredData, initialColumns, sortState],
  );

  const totalItems = sortedData.length;
  const totalPages = pageCount(totalItems, pageSize);
  const validCurrentPage = clampPage(currentPage, totalPages);

  React.useEffect(() => {
    if (currentPage !== validCurrentPage) setCurrentPage(validCurrentPage);
  }, [currentPage, validCurrentPage]);

  const paginatedData = useMemo(
    () => paginate(sortedData, validCurrentPage, pageSize),
    [sortedData, validCurrentPage, pageSize],
  );

  const displayColumns = useMemo(
    () => orderColumns(initialColumns, visibleColumns, columnPins),
    [initialColumns, visibleColumns, columnPins],
  );

  return {
    searchQuery,
    setSearchQuery,
    columnFilters,
    setColumnFilters,
    sortState,
    pageSize,
    setPageSize,
    columnPins,
    visibleColumns,
    setVisibleColumns,
    isColumnMenuOpen,
    setIsColumnMenuOpen,
    getCellValue: (row: T, column: ColumnDef<T>) => getCellValue(row, column),
    resolvedFilterOptions,
    paginatedData,
    totalItems,
    totalPages,
    currentPage: validCurrentPage,
    setCurrentPage,
    handleSortToggle: (columnId: string) =>
      setSortState((previous) => nextSortState(previous, columnId)),
    handlePinToggle: (columnId: string) =>
      setColumnPins((previous) => nextPinState(previous, columnId)),
    handleResetFilters: () => {
      setSearchQuery('');
      setColumnFilters({});
      setSortState(defaultSort ?? null);
      setCurrentPage(1);
    },
    hasActiveFilters: hasActiveFilters(searchQuery, columnFilters),
    displayColumns,
  };
}
