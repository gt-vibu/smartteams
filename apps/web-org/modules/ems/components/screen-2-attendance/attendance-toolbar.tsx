'use client';

import React from 'react';

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
    <div className="bg-[#EEF2F6]/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
      {/* Tab Title */}
      <div className="flex items-center space-x-4">
        <h1 className="!text-sm !font-bold !text-slate-900 !m-0 border-b-2 border-[#0284C7] pb-1">
          {title}
        </h1>
      </div>


      {/* Date Navigator & View Switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date Range Navigator */}
        <div className="flex items-center bg-white border border-slate-200 rounded px-2 py-1 shadow-xs text-xs font-semibold text-slate-700">
          <button
            onClick={onPrevDate}
            className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer"
            title="Previous Period"
            aria-label="Previous Period"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 px-2 text-slate-800">
            <svg className="h-3.5 w-3.5 text-slate-400 hidden xs:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="truncate max-w-[140px] xs:max-w-none">{dateRange}</span>
          </div>
          <button
            onClick={onNextDate}
            className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer"
            title="Next Period"
            aria-label="Next Period"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* View Toggle Icons — hidden on very small screens */}
        {onChangeViewMode && (
          <div className="hidden xs:flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            {/* Timeline View Toggle */}
            <button
              onClick={() => onChangeViewMode('timeline')}
              className={`p-1.5 transition-colors cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-sky-50 text-[#0284C7] font-bold'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
              title="Timeline View"
              aria-label="Timeline View"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>

            {/* Table View Toggle */}
            <button
              onClick={() => onChangeViewMode('table')}
              className={`p-1.5 transition-colors border-l border-slate-200 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-sky-50 text-[#0284C7] font-bold'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
              title="Table View"
              aria-label="Table View"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Calendar View Toggle */}
            <button
              onClick={() => onChangeViewMode('calendar')}
              className={`p-1.5 transition-colors border-l border-slate-200 cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-sky-50 text-[#0284C7] font-bold'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
              title="Calendar View"
              aria-label="Calendar View"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        )}

        {/* Filter Toggle */}
        <button
          onClick={onFilterToggle}
          className={`p-1.5 border rounded shadow-xs transition-colors cursor-pointer ${
            isFilterActive
              ? 'bg-sky-50 border-sky-300 text-sky-700'
              : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
          }`}
          title="Toggle Filter"
          aria-label="Filter"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

