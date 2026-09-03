'use client';

import React from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { HeroBanner } from './hero-banner';
import { EmployeeProfilePanel } from './employee-profile-panel';
import { SubNavTabs } from './sub-nav-tabs';
import { GreetingCard } from './greeting-card';
import { TimesheetStatusCard } from './timesheet-status-card';
import { WorkScheduleCard } from './work-schedule-card';
import { UpcomingHolidaysCard } from './upcoming-holidays-card';
import { OverviewFeedsTab } from './overview-feeds-tab';
import { OverviewProfileTab } from './overview-profile-tab';
import { OverviewApprovalsTab } from './overview-approvals-tab';
import { OverviewDashboardTab } from './overview-dashboard-tab';
import { OverviewLeavePreviewTab } from './overview-leave-preview-tab';
import { OverviewAttendancePreviewTab } from './overview-attendance-preview-tab';
import { OverviewTimesheetPreviewTab } from './overview-timesheet-preview-tab';
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { useTimesheet } from '../../hooks/use-timesheet';
import { useHolidays } from '../../hooks/use-holidays';
import type { DailyAttendanceItem } from '../../types/attendance.types';
import { toDailyStatus } from '../../services/attendance-view';
import { formatDateLabel } from '../../utils/formatters';

const TOP_TABS = ['Overview', 'Dashboard', 'Calendar'] as const;

/**
 * 'Approvals' stays in this list even though only a line manager sees the control: rejecting it
 * for everyone else would mean a manager's shared link landed silently on Activities.
 */
const SUB_TABS = [
  'Activities',
  'Feeds',
  'Profile',
  'Approvals',
  'Leave',
  'Attendance',
  'Time Logs',
  'Timesheets',
] as const;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

interface Screen1OverviewProps {
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen1Overview({ onNavigateModule }: Screen1OverviewProps) {
  // Two independent levels, each its own history entry: moving through the sub-tabs and then
  // pressing Back returns to the previous sub-tab rather than leaving the screen.
  const [activeTopTab, setActiveTopTab] = useScreenTab('overviewTab', TOP_TABS, 'Overview');
  const [activeSubTab, setActiveSubTab] = useScreenTab('overviewSection', SUB_TABS, 'Activities');
  const { employee } = useEmployee();
  const { days: records } = useAttendance();
  const { approvedTimesheet } = useTimesheet();
  const holidays = useHolidays();

  // The card shows what is still ahead this year, from the calendar the API returned.
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = holidays.holidays
    .filter((holiday) => holiday.isActive && holiday.holidayDate.slice(0, 10) >= todayKey)
    .slice(0, 3);

  const shiftInfo = {
    id: 'shift_general',
    code: 'GEN',
    // Shift assignment is not wired; the card reports that rather than naming a shift.
    name: 'Not recorded',
    startsAt: '--',
    endsAt: '--',
  };

  // Convert attendance records to week schedule format
  const weekScheduleDays: DailyAttendanceItem[] = records.map((r) => ({
    id: r.id,
    workDate: r.workDate,
    dayOfWeek: r.dayOfWeek,
    dayNumber: r.dayNumber,
    dayStatus: toDailyStatus(r.dayStatus),
    workedMinutes: r.workedMinutes,
    isToday: r.isToday,
  }));
  const scheduleDates = records.map((record) => record.workDate).sort();
  const scheduleStartDate = scheduleDates[0] ? formatDateLabel(scheduleDates[0]) : 'Current period';
  const scheduleEndDate = scheduleDates[scheduleDates.length - 1]
    ? formatDateLabel(scheduleDates[scheduleDates.length - 1]!)
    : '';

  // The tab name arrives from a child as a plain string, so it is checked against the list
  // rather than asserted. An unknown name is ignored instead of blanking the screen.
  const handleSelectSubTab = (tab: string) => {
    if (isOneOf(tab, SUB_TABS)) setActiveSubTab(tab);
  };

  const handleSelectTopTab = (tab: string) => {
    if (isOneOf(tab, TOP_TABS)) setActiveTopTab(tab);
  };

  return (
    <div className="w-full max-w-full pb-14 bg-background min-h-full">
      {/* 1. Full-Width Hero Banner */}
      <HeroBanner activeTab={activeTopTab} onSelectTab={handleSelectTopTab} />

      {/* 2. Top-Level Tab: Calendar */}
      {activeTopTab === 'Calendar' ? (
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 pt-4">
          <Screen4Calendar />
        </div>
      ) : activeTopTab === 'Dashboard' ? (
        /* Top-Level Tab: Executive Dashboard */
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 -mt-16 relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 xl:col-span-3">
              <EmployeeProfilePanel />
            </div>
            <div className="lg:col-span-8 xl:col-span-9 space-y-4 min-w-0">
              <OverviewDashboardTab onNavigateModule={onNavigateModule} />
            </div>
          </div>
        </div>
      ) : (
        /* Top-Level Tab: Standard Overview */
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 -mt-16 relative z-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Unified Employee Profile & Presence Panel */}
            <div className="lg:col-span-4 xl:col-span-3">
              <EmployeeProfilePanel />
            </div>

            {/* Right Column: Sub-Nav Tabs + Dynamic Content */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-4 min-w-0">
              <SubNavTabs activeTab={activeSubTab} onSelectTab={handleSelectSubTab} />

              {/* Tab 1: Activities (Default Home Feed) */}
              {activeSubTab === 'Activities' && (
                <>
                  {employee && <GreetingCard employee={employee} />}

                  {approvedTimesheet && <TimesheetStatusCard notification={approvedTimesheet} />}

                  <WorkScheduleCard
                    shift={shiftInfo}
                    startDate={scheduleStartDate}
                    endDate={scheduleEndDate}
                    attendanceDays={weekScheduleDays}
                  />

                  <UpcomingHolidaysCard
                    holidays={upcomingHolidays}
                    loading={holidays.loading}
                    unavailable={holidays.forbidden}
                  />
                </>
              )}

              {/* Tab 2: Feeds */}
              {activeSubTab === 'Feeds' && <OverviewFeedsTab />}

              {/* Tab 3: Full Profile */}
              {activeSubTab === 'Profile' && <OverviewProfileTab />}

              {/* Tab 4: Approvals (Manager Only) */}
              {activeSubTab === 'Approvals' && <OverviewApprovalsTab />}

              {/* Tab 5: Leave Preview */}
              {activeSubTab === 'Leave' && <OverviewLeavePreviewTab />}

              {/* Tab 6: Attendance Preview */}
              {activeSubTab === 'Attendance' && <OverviewAttendancePreviewTab />}

              {/* Tab 7: Time Logs / Timesheets Preview */}
              {(activeSubTab === 'Time Logs' || activeSubTab === 'Timesheets') && (
                <OverviewTimesheetPreviewTab />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
