'use client';

import React, { useState, useMemo } from 'react';
import { Select } from './select';
import { Checkbox } from './form';

export interface ColumnDef<T> {
  id: string;
  header: React.ReactNode;
  accessorKey?: keyof T | ((row: T) => any);
  cell?: (row: T, index: number) => React.ReactNode;
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

export interface StandardDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T, index: number) => string;
  title?: string;
  subtitle?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFields?: (keyof T | ((row: T) => string))[];
  initialRowsPerPage?: number;
  rowsPerPageOptions?: number[];
  onRowClick?: (row: T) => void;
  actions?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
  compact?: boolean;
  showColumnVisibilityToggle?: boolean;
  defaultSort?: { columnId: string; direction: 'asc' | 'desc' };
}

export function StandardDataTable<T>({
  data,
  columns: initialColumns,
  keyExtractor,
  title,
  subtitle,
  searchable = true,
  searchPlaceholder = 'Search table records...',
  searchFields,
  initialRowsPerPage = 10,
  rowsPerPageOptions = [5, 10, 20, 50, 100],
  onRowClick,
  actions,
  emptyMessage = 'No records found matching your filter criteria.',
  className = '',
  compact = false,
  showColumnVisibilityToggle = true,
  defaultSort,
}: StandardDataTableProps<T>) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortState, setSortState] = useState<{
    columnId: string;
    direction: 'asc' | 'desc';
  } | null>(defaultSort || null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialRowsPerPage);

  // Column management: pinning & visibility
  const [columnPins, setColumnPins] = useState<Record<string, 'left' | 'right' | false>>(() => {
    const pins: Record<string, 'left' | 'right' | false> = {};
    initialColumns.forEach((col) => {
      if (col.pinned) pins[col.id] = col.pinned;
    });
    return pins;
  });

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {};
    initialColumns.forEach((col) => {
      vis[col.id] = true;
    });
    return vis;
  });

  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

  // Helper to extract value for a row & column
  const getCellValue = (row: T, col: ColumnDef<T>): any => {
    if (typeof col.accessorKey === 'function') {
      return col.accessorKey(row);
    }
    if (col.accessorKey) {
      return row[col.accessorKey];
    }
    return '';
  };

  // Filter options for filterable columns (either provided or auto-generated)
  const resolvedFilterOptions = useMemo(() => {
    const optionsMap: Record<string, { label: string; value: string }[]> = {};
    initialColumns.forEach((col) => {
      if (!col.filterable) return;
      if (col.filterOptions) {
        optionsMap[col.id] = col.filterOptions;
      } else {
        // Auto derive unique values
        const unique = new Set<string>();
        data.forEach((row) => {
          const val = getCellValue(row, col);
          if (val !== null && val !== undefined && val !== '') {
            unique.add(String(val));
          }
        });
        optionsMap[col.id] = Array.from(unique)
          .sort()
          .map((v) => ({ label: v, value: v }));
      }
    });
    return optionsMap;
  }, [initialColumns, data]);

  // 1. Apply Search & Filters
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      // Global Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        let matches = false;

        if (searchFields && searchFields.length > 0) {
          matches = searchFields.some((field) => {
            const val = typeof field === 'function' ? field(row) : String(row[field] ?? '');
            return String(val).toLowerCase().includes(q);
          });
        } else {
          // Search across all columns
          matches = initialColumns.some((col) => {
            const val = getCellValue(row, col);
            return String(val ?? '')
              .toLowerCase()
              .includes(q);
          });
        }

        if (!matches) return false;
      }

      // Column specific filters
      for (const colId of Object.keys(columnFilters)) {
        const filterVal = columnFilters[colId];
        if (!filterVal || filterVal === 'ALL') continue;

        const col = initialColumns.find((c) => c.id === colId);
        if (!col) continue;

        if (col.filterFn) {
          if (!col.filterFn(row, filterVal)) return false;
        } else {
          const cellVal = String(getCellValue(row, col) ?? '');
          if (cellVal !== filterVal) return false;
        }
      }

      return true;
    });
  }, [data, searchQuery, columnFilters, searchFields, initialColumns]);

  // 2. Apply Sorting
  const sortedData = useMemo(() => {
    if (!sortState) return filteredData;

    const col = initialColumns.find((c) => c.id === sortState.columnId);
    if (!col) return filteredData;

    const copy = [...filteredData];
    copy.sort((a, b) => {
      if (col.sortFn) {
        return col.sortFn(a, b, sortState.direction);
      }

      const valA = getCellValue(a, col);
      const valB = getCellValue(b, col);

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }

      return sortState.direction === 'asc' ? cmp : -cmp;
    });

    return copy;
  }, [filteredData, sortState, initialColumns]);

  // 3. Apply Pagination
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, validCurrentPage, pageSize]);

  // Handle Sort Toggle
  const handleSortToggle = (colId: string) => {
    setSortState((prev) => {
      if (prev?.columnId !== colId) {
        return { columnId: colId, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { columnId: colId, direction: 'desc' };
      }
      return null;
    });
  };

  // Handle Pin Toggle
  const handlePinToggle = (colId: string) => {
    setColumnPins((prev) => {
      const current = prev[colId];
      if (!current) return { ...prev, [colId]: 'left' };
      if (current === 'left') return { ...prev, [colId]: 'right' };
      return { ...prev, [colId]: false };
    });
  };

  // Handle Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
    setSortState(defaultSort || null);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' || Object.values(columnFilters).some((v) => v && v !== 'ALL');

  // Compute Active Display Columns in Pinned Order (Left pinned -> Unpinned -> Right pinned)
  const displayColumns = useMemo(() => {
    const visCols = initialColumns.filter((c) => visibleColumns[c.id]);
    const leftPinned = visCols.filter((c) => columnPins[c.id] === 'left');
    const unpinned = visCols.filter((c) => !columnPins[c.id]);
    const rightPinned = visCols.filter((c) => columnPins[c.id] === 'right');

    return [...leftPinned, ...unpinned, ...rightPinned];
  }, [initialColumns, visibleColumns, columnPins]);

  return (
    <div
      className={`w-full flex flex-col bg-white dark:bg-[#1B2028] rounded-[6px] border border-slate-200/90 dark:border-[#262F3D] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}
    >
      {/* ─── Top Control Toolbar ─────────────────────────────────────────── */}
      {(title ||
        searchable ||
        Object.keys(resolvedFilterOptions).length > 0 ||
        actions ||
        showColumnVisibilityToggle) && (
        <div className="p-3.5 sm:p-4 border-b border-slate-200/90 dark:border-[#262F3D] bg-slate-50/70 dark:bg-[#161B22] space-y-3">
          {/* Header row with Title & Custom Actions */}
          {(title || actions) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {title && (
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          )}

          {/* Controls row: Search input, Dropdown filters, Reset, Column Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              {/* Search Bar */}
              {searchable && (
                <div className="relative w-full sm:w-64 max-w-xs">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-[#1B2028] border border-slate-200 dark:border-[#262F3D] rounded-md text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Column Filter Dropdowns */}
              {Object.keys(resolvedFilterOptions).map((colId) => {
                const col = initialColumns.find((c) => c.id === colId);
                if (!col) return null;
                const options = resolvedFilterOptions[colId] || [];
                const currentVal = columnFilters[colId] || 'ALL';

                return (
                  <div key={colId} className="w-40">
                    <Select
                      value={currentVal}
                      onChange={(e) => {
                        setColumnFilters((prev) => ({ ...prev, [colId]: e.target.value }));
                        setCurrentPage(1);
                      }}
                    >
                      <option value="ALL">
                        All {typeof col.header === 'string' ? col.header : col.id}
                      </option>
                      {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              })}

              {/* Active Filter Clear Button */}
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-950/70 border border-sky-200 dark:border-sky-800 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Reset
                </button>
              )}
            </div>

            {/* Column Visibility Menu Button */}
            {showColumnVisibilityToggle && (
              <div className="relative">
                <button
                  onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-[#262F3D] rounded-md px-3 py-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                  Columns
                </button>

                {isColumnMenuOpen && (
                  <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-[#1B2028] border border-slate-200 dark:border-[#262F3D] rounded-lg shadow-xl z-30 p-2 text-xs space-y-1">
                    <div className="font-bold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                      Toggle Columns & Pin
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                      {initialColumns.map((col) => {
                        const isVis = visibleColumns[col.id];
                        const pin = columnPins[col.id];
                        return (
                          <div
                            key={col.id}
                            className="flex items-center justify-between px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded"
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200 font-medium truncate flex-1 select-none">
                              <Checkbox
                                checked={isVis}
                                onCheckedChange={(checked) =>
                                  setVisibleColumns((prev) => ({ ...prev, [col.id]: !!checked }))
                                }
                              />
                              <span className="truncate">
                                {typeof col.header === 'string' ? col.header : col.id}
                              </span>
                            </label>
                            {col.pinnable !== false && (
                              <button
                                onClick={() => handlePinToggle(col.id)}
                                title={`Pin status: ${pin ? pin : 'unpinned'}`}
                                className={`p-1 rounded text-[10px] font-bold ${
                                  pin
                                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                              >
                                {pin === 'left' ? '📍L' : pin === 'right' ? '📍R' : '📌'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Main Scrollable Table Area ───────────────────────────────────── */}
      <div className="w-full overflow-x-auto relative">
        <table className="w-full text-left text-xs border-collapse">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-100/90 dark:bg-[#161B22] border-b border-slate-200 dark:border-[#262F3D] backdrop-blur-xs text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider shadow-2xs">
              {displayColumns.map((col) => {
                const isSortable = col.sortable !== false;
                const isSorted = sortState?.columnId === col.id;
                const sortDir = isSorted ? sortState.direction : null;
                const pin = columnPins[col.id];

                // Dynamic pin position styling
                let pinStyle = '';
                if (pin === 'left') {
                  pinStyle =
                    'sticky left-0 bg-slate-100/95 dark:bg-[#161B22] z-20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                } else if (pin === 'right') {
                  pinStyle =
                    'sticky right-0 bg-slate-100/95 dark:bg-[#161B22] z-20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                }

                return (
                  <th
                    key={col.id}
                    style={{ width: col.width }}
                    className={`${compact ? 'py-2 px-3' : 'py-3 px-4'} ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                          ? 'text-right'
                          : 'text-left'
                    } ${isSorted ? 'bg-sky-50/80 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 font-bold' : ''} ${pinStyle} ${
                      col.headerClassName || ''
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        isSortable
                          ? 'cursor-pointer select-none hover:text-sky-700 dark:hover:text-sky-300'
                          : ''
                      }`}
                      onClick={() => isSortable && handleSortToggle(col.id)}
                    >
                      <span>{col.header}</span>

                      {/* Sort Indicator Icon */}
                      {isSortable && (
                        <span className="text-slate-400 dark:text-slate-500">
                          {sortDir === 'asc' ? (
                            <svg
                              className="w-3 h-3 text-sky-600 dark:text-sky-400 font-bold"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          ) : sortDir === 'desc' ? (
                            <svg
                              className="w-3 h-3 text-sky-600 dark:text-sky-400 font-bold"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-60 group-hover:opacity-100"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                              />
                            </svg>
                          )}
                        </span>
                      )}

                      {/* Pin indicator tag if pinned */}
                      {pin && (
                        <span className="text-[9px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/80 px-1 rounded uppercase">
                          {pin}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-[#262F3D] text-slate-800 dark:text-slate-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} className="py-12 px-4 text-center">
                  <div className="max-w-xs mx-auto space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-700 dark:text-white">
                      No matching results
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{emptyMessage}</p>
                    {hasActiveFilters && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        Clear search and filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const key = keyExtractor(row, idx);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`hover:bg-sky-50/40 dark:hover:bg-slate-800/60 transition-colors ${
                      onRowClick ? 'cursor-pointer group' : ''
                    }`}
                  >
                    {displayColumns.map((col) => {
                      const pin = columnPins[col.id];
                      const isSorted = sortState?.columnId === col.id;

                      let pinStyle = '';
                      if (pin === 'left') {
                        pinStyle =
                          'sticky left-0 bg-white dark:bg-[#1B2028] group-hover:bg-sky-50/90 dark:group-hover:bg-slate-800 z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                      } else if (pin === 'right') {
                        pinStyle =
                          'sticky right-0 bg-white dark:bg-[#1B2028] group-hover:bg-sky-50/90 dark:group-hover:bg-slate-800 z-10 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                      }

                      return (
                        <td
                          key={col.id}
                          className={`${compact ? 'py-2 px-3' : 'py-3 px-4'} ${
                            col.align === 'center'
                              ? 'text-center'
                              : col.align === 'right'
                                ? 'text-right'
                                : 'text-left'
                          } ${isSorted ? 'bg-sky-50/30 dark:bg-sky-950/20' : ''} ${pinStyle} ${col.className || ''}`}
                        >
                          {col.cell ? col.cell(row, idx) : String(getCellValue(row, col) ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Bottom Pagination Toolbar ───────────────────────────────────── */}
      <div className="p-3 sm:px-4 border-t border-slate-200/90 dark:border-[#262F3D] bg-slate-50/70 dark:bg-[#161B22] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
        {/* Left: Summary & Rows Per Page */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            Showing{' '}
            <span className="font-bold text-slate-900 dark:text-white">
              {totalItems > 0 ? (validCurrentPage - 1) * pageSize + 1 : 0}
            </span>{' '}
            to{' '}
            <span className="font-bold text-slate-900 dark:text-white">
              {Math.min(validCurrentPage * pageSize, totalItems)}
            </span>{' '}
            of <span className="font-bold text-slate-900 dark:text-white">{totalItems}</span>{' '}
            entries
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <span className="text-slate-500 dark:text-slate-400">Rows:</span>
            <div className="w-20">
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {rowsPerPageOptions.map((opt) => (
                  <option key={opt} value={String(opt)}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Right: Page Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First Page */}
          <button
            onClick={() => setCurrentPage(1)}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded border border-slate-200 dark:border-[#262F3D] bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="First Page"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Previous Page */}
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded border border-slate-200 dark:border-[#262F3D] bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Previous Page"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Page Counter */}
          <span className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Page{' '}
            <span className="font-bold text-slate-900 dark:text-white">{validCurrentPage}</span> of{' '}
            <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span>
          </span>

          {/* Next Page */}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded border border-slate-200 dark:border-[#262F3D] bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Next Page"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Last Page */}
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded border border-slate-200 dark:border-[#262F3D] bg-white dark:bg-[#1B2028] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            title="Last Page"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M6 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
