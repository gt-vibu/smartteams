import { Button } from '@smarteam/ui';
import React from 'react';
import { Screen1Overview } from '../screen-1-overview/screen-1-overview';
import { Screen2Timeline } from '../screen-2-attendance/screen-2-timeline';
import { Screen3Table } from '../screen-3-attendance-table/screen-3-table';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { Screen5TimeTracker } from '../screen-5-timetracker/screen-5-timetracker';
import { Screen7TimeOff } from '../screen-7-timeoff/screen-7-timeoff';

interface AllScreensGridProps {
  onSelectScreen: (screenKey: string) => void;
}

export function AllScreensGrid({ onSelectScreen }: AllScreensGridProps) {
  const screens = [
    {
      id: 'screen_1',
      title: 'Screen 1: Employee Overview & Presence',
      badge: 'Home / My Space',
      component: (
        <Screen1Overview
          onNavigateModule={(mod) => {
            if (mod === 'home') onSelectScreen('screen_1');
            else if (mod === 'attendance') onSelectScreen('screen_2');
            else if (mod === 'timesheet') onSelectScreen('screen_5');
            else if (mod === 'time-off') onSelectScreen('screen_7');
          }}
        />
      ),
    },
    {
      id: 'screen_2',
      title: 'Screen 2: Attendance Summary (Timeline View)',
      badge: 'Attendance · Timeline',
      component: <Screen2Timeline />,
    },
    {
      id: 'screen_3',
      title: 'Screen 3: Attendance Summary (Table View & Detail Drawer)',
      badge: 'Attendance · Table',
      component: <Screen3Table />,
    },
    {
      id: 'screen_4',
      title: 'Screen 4: Month Calendar & Shift Schedule',
      badge: 'Calendar',
      component: <Screen4Calendar />,
    },
    {
      id: 'screen_5',
      title: 'Screen 5: Time Tracker & Time Logs',
      badge: 'Timesheet · Grouped Logs',
      component: <Screen5TimeTracker />,
    },
    {
      id: 'screen_7',
      title: 'Screen 7: Leave / Time Off Dashboard & Quotas',
      badge: 'Time Off · Balances',
      component: <Screen7TimeOff />,
    },
  ];

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 py-6 space-y-8">
      {/* Header */}
      <div className="bg-card rounded-[6px] border border-border/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between">
        <div>
          <h1 className="!text-base !font-bold !text-foreground !m-0">
            Smarteam EMS — All Screens Unified Gallery
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Complete high-fidelity suite built with Zoho People UX fidelity & Smarteam enterprise
            backend models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground bg-muted px-2.5 py-1 rounded border border-border">
            6 Production Modules Live
          </span>
        </div>
      </div>

      {/* Grid of All Screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {screens.map((s, index) => (
          <div
            key={s.id}
            className="bg-card rounded-[8px] border border-border shadow-md overflow-hidden flex flex-col group hover:border-slate-400 transition-all"
          >
            {/* Screen Header Bar */}
            <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="h-6 w-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                  {index + 1}
                </span>
                <h2 className="!text-xs !font-bold !text-foreground !m-0">{s.title}</h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground bg-card px-2 py-0.5 rounded border border-border">
                  {s.badge}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectScreen(s.id)}
                  className="text-xs font-semibold text-foreground hover:text-foreground flex items-center gap-1"
                >
                  <span>Focus View</span>
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Embedded Live Screen Canvas */}
            <div className="flex-1 bg-muted overflow-x-auto p-3 max-h-[620px] overflow-y-auto">
              <div className="min-w-[720px] transform origin-top">{s.component}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
