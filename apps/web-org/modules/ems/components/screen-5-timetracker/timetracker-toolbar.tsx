import React from 'react';

interface TimeTrackerToolbarProps {
  activeSubTab: string;
  onSelectSubTab: (tab: string) => void;
  onOpenLogTime: () => void;
  monthName?: string;
}

export function TimeTrackerToolbar({
  activeSubTab,
  onSelectSubTab,
  onOpenLogTime,
  monthName = 'Aug 2026',
}: TimeTrackerToolbarProps) {
  const tabs = ['Time Logs', 'Timesheets', 'Jobs', 'Projects', 'Job Schedule'];

  return (
    <div className="bg-[#EEF2F6]/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
      {/* Sub-Tabs: Time Logs / Timesheets / Jobs / Projects / Job Schedule */}
      <div className="flex items-center space-x-4 sm:space-x-5 overflow-x-auto no-scrollbar py-0.5">

        {tabs.map((tab) => {
          const isActive = activeSubTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onSelectSubTab(tab)}
              className={`text-xs font-semibold pb-1 transition-colors relative whitespace-nowrap ${
                isActive
                  ? 'text-[#0284C7] border-b-2 border-[#0284C7]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Date Navigator, Log Time Split Button & View Toggles */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
        {/* Month Navigator */}
        <div className="flex items-center bg-white border border-slate-200 rounded px-2 py-1 shadow-xs text-xs font-semibold text-slate-700">
          <button className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer" title="Previous Month">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 px-2 text-slate-800 font-bold">
            <svg className="h-3.5 w-3.5 text-slate-400 hidden xs:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{monthName}</span>
          </div>
          <button className="p-0.5 hover:text-slate-900 text-slate-400 cursor-pointer" title="Next Month">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Split Action Button: Log Time ▾ */}
        <div className="inline-flex rounded shadow-xs overflow-hidden">
          <button
            onClick={onOpenLogTime}
            className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Log Time
          </button>
          <button
            onClick={onOpenLogTime}
            className="px-1.5 py-1.5 bg-[#0369A1] hover:bg-[#0284C7] text-white text-xs border-l border-sky-400 transition-colors cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* View Toggles & Filter — hidden on small mobile */}
        <div className="hidden sm:flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <button className="p-1.5 bg-sky-50 text-[#0284C7] cursor-pointer" title="Table List View">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button className="p-1.5 text-slate-400 hover:text-slate-700 border-l border-slate-200 cursor-pointer" title="Calendar View">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <button
          className="hidden sm:flex p-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-slate-700 shadow-xs transition-colors cursor-pointer"
          title="Filter"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>

        <button
          className="hidden sm:flex p-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-slate-700 shadow-xs transition-colors cursor-pointer"
          title="More options"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        </button>
      </div>
    </div>
  );
}
