import React from 'react';
import { Button, Tabs, TabsList, TabsTrigger } from '@smarteam/ui';

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
    <div className="flex w-full flex-col justify-between gap-2 border-b border-border/90 bg-card/95 px-4 pb-3 pt-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6">
      {/* Wraps on the narrowest phones instead of panning; five labels are ~330px wide. */}
      <Tabs aria-label="Time tracking views" onValueChange={onSelectSubTab} value={activeSubTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-x-3 gap-y-2 bg-transparent p-0 sm:gap-x-5">
          {TABS.map((tab) => (
            <TabsTrigger
              className="whitespace-nowrap rounded-none border-b-2 border-transparent px-0 pb-1 text-xs font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none"
              key={tab}
              value={tab}
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2.5">
        <div className="flex items-center rounded border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground shadow-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-muted-foreground hover:text-foreground"
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
          <span className="px-2 font-bold text-foreground">{monthName}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-muted-foreground hover:text-foreground"
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
