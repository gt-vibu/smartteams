'use client';

import React from 'react';
import { Button } from '@smarteam/ui';

export interface AttendanceToolbarProps {
  title?: string;
  viewMode: 'timeline' | 'table' | 'calendar';
  onChangeViewMode?: (mode: 'timeline' | 'table' | 'calendar') => void;
  dateRange: string;
  onPrevDate?: () => void;
  onNextDate?: () => void;
  onFilterToggle?: () => void;
  isFilterActive?: boolean;
}

const VIEWS: Array<{ value: AttendanceToolbarProps['viewMode']; label: string }> = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'table', label: 'Table' },
  { value: 'calendar', label: 'Calendar' },
];

export function AttendanceToolbar({
  title = 'Attendance Summary',
  viewMode,
  onChangeViewMode,
  dateRange,
  onPrevDate,
  onNextDate,
  onFilterToggle,
  isFilterActive,
}: AttendanceToolbarProps) {
  return (
    <div className="flex w-full flex-col justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-4 pb-3 pt-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6">
      <h1 className="!m-0 border-b-2 border-slate-900 pb-1 !text-sm !font-bold !text-slate-900">
        {title}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Previous period"
            aria-label="Previous period"
            disabled={!onPrevDate}
            onClick={onPrevDate}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <span className="max-w-[140px] truncate px-2 text-slate-800 xs:max-w-none">
            {dateRange}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Next period"
            aria-label="Next period"
            disabled={!onNextDate}
            onClick={onNextDate}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>

        {onChangeViewMode && (
          <div
            className="hidden items-center overflow-hidden rounded border border-slate-200 bg-white shadow-xs xs:flex"
            role="tablist"
            aria-label="Attendance views"
          >
            {VIEWS.map((view) => (
              <Button
                key={view.value}
                type="button"
                variant="ghost"
                role="tab"
                aria-selected={viewMode === view.value}
                onClick={() => onChangeViewMode(view.value)}
                className={`rounded-none px-3 py-1.5 text-xs ${viewMode === view.value ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                {view.label}
              </Button>
            ))}
          </div>
        )}

        {onFilterToggle && (
          <Button
            type="button"
            variant={isFilterActive ? 'secondary' : 'outline'}
            size="icon"
            onClick={onFilterToggle}
            title="Toggle filters"
            aria-label="Toggle filters"
            aria-pressed={isFilterActive}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
          </Button>
        )}
      </div>
    </div>
  );
}
