'use client';

import React from 'react';
import { Select } from './select';
import { Checkbox } from './form';
import { StandardDataTablePagination } from './standard-data-table-pagination';
import { displayValue, useStandardDataTable, type ColumnDef } from './standard-data-table-model';

// Re-exported so every existing `import { ColumnDef } from '@smarteam/ui'` keeps working: the
// split is internal, and the component's public surface is unchanged.
export type { ColumnDef };

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
  const {
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
    getCellValue,
    resolvedFilterOptions,
    paginatedData,
    totalItems,
    totalPages,
    currentPage: validCurrentPage,
    setCurrentPage,
    handleSortToggle,
    handlePinToggle,
    handleResetFilters,
    hasActiveFilters,
    displayColumns,
  } = useStandardDataTable<T>({
    data,
    columns: initialColumns,
    searchFields,
    initialRowsPerPage,
    defaultSort,
  });

  return (
    <div
      className={`w-full flex flex-col bg-card rounded-[6px] border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}
    >
      {/* ─── Top Control Toolbar ─────────────────────────────────────────── */}
      {(title ||
        searchable ||
        Object.keys(resolvedFilterOptions).length > 0 ||
        actions ||
        showColumnVisibilityToggle) && (
        <div className="p-3.5 sm:p-4 border-b border-border bg-muted/40 space-y-3">
          {/* Header row with Title & Custom Actions */}
          {(title || actions) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {title && <h3 className="text-sm font-bold text-foreground">{title}</h3>}
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-muted-foreground">
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
                    aria-label={searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-card border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center text-muted-foreground hover:text-foreground"
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
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 bg-primary/10 hover:bg-primary/15 border border-primary/25 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer"
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
                  type="button"
                  aria-expanded={isColumnMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-card hover:bg-muted/50 border border-border rounded-md px-3 py-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-muted-foreground"
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
                  <div className="absolute right-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-xl z-30 p-2 text-xs space-y-1">
                    <div className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider px-2 py-1 border-b border-border">
                      Toggle Columns & Pin
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                      {initialColumns.map((col) => {
                        const isVis = visibleColumns[col.id];
                        const pin = columnPins[col.id];
                        return (
                          <div
                            key={col.id}
                            className="flex items-center justify-between px-2 py-1 hover:bg-muted/50/80 rounded"
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-foreground font-medium truncate flex-1 select-none">
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
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
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
            <tr className="bg-table-header border-b border-border backdrop-blur-xs text-[11px] font-semibold text-table-header-foreground uppercase tracking-wider shadow-2xs">
              {displayColumns.map((col) => {
                const isSortable = col.sortable !== false;
                const isSorted = sortState?.columnId === col.id;
                const sortDir = isSorted ? sortState.direction : null;
                const pin = columnPins[col.id];

                // Dynamic pin position styling
                let pinStyle = '';
                if (pin === 'left') {
                  pinStyle =
                    'sticky left-0 bg-table-header z-20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                } else if (pin === 'right') {
                  pinStyle =
                    'sticky right-0 bg-table-header z-20 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]';
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
                    } ${isSorted ? 'bg-primary/10 text-primary font-bold' : ''} ${pinStyle} ${
                      col.headerClassName || ''
                    }`}
                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      disabled={!isSortable}
                      className={`inline-flex items-center gap-1.5 ${
                        isSortable
                          ? 'cursor-pointer select-none hover:text-primary'
                          : 'cursor-default'
                      }`}
                      onClick={() => isSortable && handleSortToggle(col.id)}
                    >
                      <span>{col.header}</span>

                      {/* Sort Indicator Icon */}
                      {isSortable && (
                        <span className="text-muted-foreground">
                          {sortDir === 'asc' ? (
                            <svg
                              className="w-3 h-3 text-primary font-bold"
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
                              className="w-3 h-3 text-primary font-bold"
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
                              className="w-3 h-3 text-muted-foreground/50 opacity-60 group-hover:opacity-100"
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
                        <span className="text-[9px] font-bold text-primary bg-primary/15 px-1 rounded uppercase">
                          {pin}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border text-foreground">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} className="py-12 px-4 text-center">
                  <div className="max-w-xs mx-auto space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
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
                    <div className="text-sm font-bold text-foreground">No matching results</div>
                    <p className="text-xs text-muted-foreground">{emptyMessage}</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
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
                    className={`hover:bg-primary/6 transition-colors ${
                      onRowClick ? 'cursor-pointer group' : ''
                    }`}
                  >
                    {displayColumns.map((col) => {
                      const pin = columnPins[col.id];
                      const isSorted = sortState?.columnId === col.id;

                      let pinStyle = '';
                      if (pin === 'left') {
                        pinStyle =
                          'sticky left-0 bg-card group-hover:bg-primary/6 z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]';
                      } else if (pin === 'right') {
                        pinStyle =
                          'sticky right-0 bg-card group-hover:bg-primary/6 z-10 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]';
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
                          } ${isSorted ? 'bg-primary/5' : ''} ${pinStyle} ${col.className || ''}`}
                        >
                          {col.cell ? col.cell(row, idx) : displayValue(getCellValue(row, col))}
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

      <StandardDataTablePagination
        totalItems={totalItems}
        currentPage={validCurrentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        rowsPerPageOptions={rowsPerPageOptions}
        onPageChange={setCurrentPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setCurrentPage(1);
        }}
      />
    </div>
  );
}
