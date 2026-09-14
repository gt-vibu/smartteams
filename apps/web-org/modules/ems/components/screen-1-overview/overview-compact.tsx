'use client';

import React from 'react';
import { BotanicalCover } from '../layout/botanical-cover';
import { PageShell } from '../layout/page-shell';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { EmployeeProfilePanel } from './employee-profile-panel';
import { OverviewActivitiesTab } from './overview-activities-tab';
import { OverviewApprovalsTab } from './overview-approvals-tab';
import { OverviewAttendancePreviewTab } from './overview-attendance-preview-tab';
import { OverviewDashboardTab } from './overview-dashboard-tab';
import { OverviewLeavePreviewTab } from './overview-leave-preview-tab';
import { OverviewProfileTab } from './overview-profile-tab';
import { OverviewTimesheetPreviewTab } from './overview-timesheet-preview-tab';
import { useIsManagerApprover } from './sub-nav-tabs';

/**
 * Everything Home can show on a phone. The first four are the strip; the rest are reachable only
 * by a link, because each is a preview of a module the bottom bar already opens in full.
 */
export type CompactSection =
  | 'Profile'
  | 'Activities'
  | 'Approvals'
  | 'Dashboard'
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
 * The laptop layout is two columns — the profile beside a tab strip — and below `lg` those
 * columns used to stack. Home on a phone therefore opened as the whole profile panel, then a tab
 * strip, then the Activities tab's cards, all on one page, under a second tab bar (Overview /
 * Dashboard / Calendar) in the banner. Two navigation levels and three subjects on one scroll.
 *
 * Here there is one strip and one subject. Profile — the card with check-in and the full details
 * — is where Home opens, the way an HR app opens on "me". Leave, Attendance and Timesheets are
 * not in the strip: they are previews of modules one tap away in the bottom bar, and repeating
 * them here was the "same thing in two places" a phone has no room for. Links to them still work.
 */
export function OverviewCompact({
  section,
  onSelectSection,
  onNavigateModule,
}: OverviewCompactProps) {
  const isManagerApprover = useIsManagerApprover();
  const strip: CompactSection[] = [
    'Profile',
    'Activities',
    ...(isManagerApprover ? (['Approvals'] as const) : []),
    'Dashboard',
  ];

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
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'Profile' ? (
        <>
          <BotanicalCover heightClass="h-24" />
          <PageShell className="relative z-20 -mt-12">
            <EmployeeProfilePanel />
            <OverviewProfileTab />
          </PageShell>
        </>
      ) : (
        <PageShell>
          {section === 'Activities' && <OverviewActivitiesTab />}
          {section === 'Approvals' && <OverviewApprovalsTab />}
          {section === 'Dashboard' && <OverviewDashboardTab onNavigateModule={onNavigateModule} />}
          {section === 'Leave' && <OverviewLeavePreviewTab />}
          {section === 'Attendance' && <OverviewAttendancePreviewTab />}
          {section === 'Timesheets' && <OverviewTimesheetPreviewTab />}
          {section === 'Calendar' && <Screen4Calendar />}
        </PageShell>
      )}
    </div>
  );
}
