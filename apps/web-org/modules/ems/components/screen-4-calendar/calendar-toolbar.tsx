import React from 'react';

interface CalendarToolbarProps {
  monthName: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onToday?: () => void;
  viewMode?: 'timeline' | 'table' | 'calendar';
  onChangeViewMode?: (mode: 'timeline' | 'table' | 'calendar') => void;
}

export function CalendarToolbar({
  monthName,
  onPrevMonth,
  onNextMonth,
  onToday,
  viewMode = 'calendar',
  onChangeViewMode,
}: CalendarToolbarProps) {
  return (
    <div className="bg-[#EEF2F6]/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
      {/* Month Navigator & Today Button */}
      <div className="flex items-center gap-3">

        <button
          onClick={onToday}
          className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
        >
          Today
        </button>

        <div className="flex items-center bg-white border border-slate-200 rounded px-2 py-1 shadow-xs text-xs font-bold text-slate-800">
          <button
            onClick={onPrevMonth}
            className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer"
            title="Previous Month"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 px-3">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{monthName}</span>
          </div>
          <button
            onClick={onNextMonth}
            className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer"
            title="Next Month"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* View Switchers & Filter */}
      <div className="flex items-center gap-2">
        {onChangeViewMode && (
          <div className="flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
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

        <div className="flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden text-xs font-semibold text-slate-600">
          <button className="px-3 py-1 bg-sky-50 text-[#0284C7] font-bold cursor-pointer">
            Month
          </button>
          <button className="px-3 py-1 hover:bg-slate-50 border-l border-slate-200 text-slate-500 cursor-pointer">
            Week
          </button>
          <button className="px-3 py-1 hover:bg-slate-50 border-l border-slate-200 text-slate-500 cursor-pointer">
            Day
          </button>
        </div>

        <button
          className="p-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-slate-700 shadow-xs transition-colors cursor-pointer"
          title="Filter"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

