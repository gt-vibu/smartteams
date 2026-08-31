import React from 'react';
import { Button } from '@smarteam/ui';

interface TimeTrackerToolbarProps {
  activeSubTab: string;
  onSelectSubTab: (tab: string) => void;
  onOpenLogTime: () => void;
  monthName: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

const TABS = ['Time Logs', 'Timesheets', 'Jobs', 'Projects', 'Job Schedule'];

export function TimeTrackerToolbar({
  activeSubTab,
  onSelectSubTab,
  onOpenLogTime,
  monthName,
  onPrevMonth,
  onNextMonth,
}: TimeTrackerToolbarProps) {
  return (
    <div className="flex w-full flex-col justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-4 pb-3 pt-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6">
      <div
        className="flex items-center space-x-4 overflow-x-auto py-0.5 sm:space-x-5 no-scrollbar"
        role="tablist"
        aria-label="Time tracking views"
      >
        {TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={activeSubTab === tab}
            onClick={() => onSelectSubTab(tab)}
            className={`relative whitespace-nowrap px-0 pb-1 text-xs font-semibold rounded-none ${
              activeSubTab === tab
                ? 'border-b-2 border-slate-900 text-slate-900 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
          </Button>
        ))}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2.5">
        <div className="flex items-center rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Previous month"
            aria-label="Previous month"
            onClick={onPrevMonth}
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
          <span className="px-2 font-bold text-slate-800">{monthName}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Next month"
            aria-label="Next month"
            onClick={onNextMonth}
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

        <Button
          type="button"
          variant="default"
          onClick={onOpenLogTime}
          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs"
        >
          Log Time
        </Button>
      </div>
    </div>
  );
}
