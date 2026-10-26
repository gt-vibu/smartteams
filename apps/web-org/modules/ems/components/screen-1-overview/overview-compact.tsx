'use client';

import React from 'react';
import { PageShell } from '../layout/page-shell';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { OverviewActivitiesTab } from './overview-activities-tab';
import { OverviewApprovalsTab } from './overview-approvals-tab';
import { OverviewAttendancePreviewTab } from './overview-attendance-preview-tab';
import { OverviewDashboardTab } from './overview-dashboard-tab';
import { OverviewLeavePreviewTab } from './overview-leave-preview-tab';
import { OverviewTimesheetPreviewTab } from './overview-timesheet-preview-tab';
import { BotanicalCover } from '../layout/botanical-cover';
import { EmployeeProfilePanel } from './employee-profile-panel';
import { OverviewProfileTab } from './overview-profile-tab';

/**
 * The two phone home views match the employee's everyday mental model. Full work modules remain
 * in the bottom navigation; manager approvals stay reachable from the approvals module.
 */
export type CompactSection =
  | 'Profile'
  | 'Activities'
  | 'Approvals'
  | 'Leave'
  | 'Attendance'
  | 'Timesheets'
  | 'Calendar';

interface OverviewCompactProps {
  section: CompactSection;
  onSelectSection: (section: CompactSection) => void;
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
}

/**
 * Home on a phone: one section at a time.
 *
 * Home on a phone keeps the familiar employee banner, live attendance card and work details.
 * Compact dashboard summaries follow those, so the daily check-in remains the first task.
 */
export function OverviewCompact({
  section,
  onSelectSection,
  onNavigateModule,
}: OverviewCompactProps) {
  const strip: CompactSection[] = ['Profile', 'Activities'];

  return (
    <div className="min-h-full w-full max-w-full bg-background pb-6">
      <div className="sticky top-[var(--ems-context-bar-height)] z-30 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md sm:px-6">
        <div
          role="tablist"
          aria-label="Home"
          className="grid gap-1 rounded-xl bg-muted p-1"
          style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}
        >
          {strip.map((item) => {
            const isActive = item === section;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectSection(item)}
                className={`min-h-9 truncate rounded-lg px-1 text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item === 'Activities' ? 'My week' : item}
              </button>
            );
          })}
        </div>
      </div>

      <PageShell>
          {section === 'Profile' && <>
            <div className="-mx-4 -mt-2 sm:-mx-6"><BotanicalCover heightClass="h-32" /></div>
            <div className="relative z-10 -mt-16 space-y-3 px-0">
              <EmployeeProfilePanel />
              <OverviewProfileTab />
              <OverviewDashboardTab compactStatsOnly onNavigateModule={onNavigateModule} />
            </div>
          </>}
          {section === 'Activities' && (
            <OverviewActivitiesTab onNavigateModule={onNavigateModule} />
          )}
          {section === 'Approvals' && <OverviewApprovalsTab />}
          {section === 'Leave' && <OverviewLeavePreviewTab />}
          {section === 'Attendance' && <OverviewAttendancePreviewTab />}
          {section === 'Timesheets' && <OverviewTimesheetPreviewTab />}
          {section === 'Calendar' && <Screen4Calendar />}
      </PageShell>
    </div>
  );
}
