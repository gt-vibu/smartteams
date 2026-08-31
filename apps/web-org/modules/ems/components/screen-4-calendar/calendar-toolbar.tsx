import React from 'react';
import { Button, Tabs, TabsList, TabsTrigger } from '@smarteam/ui';

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
  const views: Array<{ value: 'timeline' | 'table' | 'calendar'; label: string }> = [
    { value: 'timeline', label: 'Timeline' },
    { value: 'table', label: 'Table' },
    { value: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className="flex w-full flex-col justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-4 pb-3 pt-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6">
      <div className="flex items-center gap-3">
        {onToday && (
          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
        )}
        <div className="flex items-center rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Previous month"
            aria-label="Previous month"
            disabled={!onPrevMonth}
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
          <span className="max-w-[140px] truncate px-2 text-slate-800 xs:max-w-none font-bold">
            {monthName}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0.5 text-slate-400 hover:text-slate-900"
            title="Next month"
            aria-label="Next month"
            disabled={!onNextMonth}
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
      </div>

      {onChangeViewMode && (
        <Tabs
          aria-label="Calendar views"
          onValueChange={(value) => onChangeViewMode(value as 'timeline' | 'table' | 'calendar')}
          value={viewMode}
        >
          <TabsList className="h-auto rounded-md border border-border bg-card p-0">
            {views.map((view) => (
              <TabsTrigger
                className="rounded-none px-3 py-1.5 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                key={view.value}
                value={view.value}
              >
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </div>
  );
}
