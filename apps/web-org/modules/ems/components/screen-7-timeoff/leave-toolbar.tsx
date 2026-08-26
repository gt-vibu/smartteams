import React from 'react';

interface LeaveToolbarProps {
  activeSubTab: string;
  onSelectSubTab: (tab: string) => void;
  onOpenApplyLeave: () => void;
  yearLabel?: string;
}

export function LeaveToolbar({
  activeSubTab,
  onSelectSubTab,
  onOpenApplyLeave,
  yearLabel = '2026',
}: LeaveToolbarProps) {
  const tabs = ['Leave Summary', 'Leave Applications', 'Holidays', 'Leave Policy'];

  return (
    <div className="bg-[#EEF2F6]/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
      {/* Sub-Tabs: Leave Summary / Leave Applications / Holidays / Policy */}
      <div className="flex items-center space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar py-0.5">

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

      {/* Year Navigator & + Apply Leave Primary Button */}
      <div className="flex items-center gap-3">
        {/* Year Navigator */}
        <div className="flex items-center bg-white border border-slate-200 rounded px-2 py-1 shadow-xs text-xs font-semibold text-slate-700">
          <button className="p-0.5 hover:text-slate-900 text-slate-400" title="Previous Year">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 px-3 font-bold text-slate-800">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{yearLabel}</span>
          </div>
          <button className="p-0.5 hover:text-slate-900 text-slate-400" title="Next Year">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Primary Action Button: + Apply Leave */}
        <button
          onClick={onOpenApplyLeave}
          className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Apply Leave</span>
        </button>
      </div>
    </div>
  );
}
