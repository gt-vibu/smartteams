'use client';

import React, { useMemo } from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { HeroBanner } from './hero-banner';
import { EmployeeProfilePanel } from './employee-profile-panel';
import { SubNavTabs } from './sub-nav-tabs';
import { GreetingCard } from './greeting-card';
import { TimesheetStatusCard } from './timesheet-status-card';
import { WorkScheduleCard } from './work-schedule-card';
import { UpcomingHolidaysCard } from './upcoming-holidays-card';
import { CompanyDocumentsCard } from './company-documents-card';
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
import { useEmployeeHolidays } from '../../hooks/use-employee-holidays';
import type { DailyAttendanceItem } from '../../types/attendance.types';
import type { Holiday } from '@smarteam/contracts';
import { toDailyStatus } from '../../services/attendance-view';
import { formatDateLabel } from '../../utils/formatters';
import { PageShell } from '../layout/page-shell';

const TOP_TABS = ['Overview', 'Dashboard', 'Calendar'] as const;

/**
 * 'Approvals' stays in this list even though only a line manager sees the control: rejecting it
 * for everyone else would mean a manager's shared link landed silently on Activities.
 */
const SUB_TABS = [
  'Activities',
  // 'Feeds', // Commented out until real backend persistence is connected
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
  const employeeHolidays = useEmployeeHolidays();

  // The card shows effective holidays still ahead this year for the employee (mandatory + confirmed selections).
  const todayKey = new Date().toISOString().slice(0, 10);
  const effectiveHolidays: Holiday[] = useMemo(() => {
    if (employeeHolidays.hasEmployeeRecord && employeeHolidays.summary) {
      const selectedHols = employeeHolidays.selections
        .filter((s) => s.status === 'CONFIRMED' && s.holiday)
        .map((s) => s.holiday!);
      const allEffective = [...employeeHolidays.mandatoryHolidays, ...selectedHols];
      return allEffective
        .filter((h) => h.isActive && h.holidayDate.slice(0, 10) >= todayKey)
        .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
    }
    return holidays.holidays
      .filter(
        (holiday) =>
          holiday.isActive && !holiday.isOptional && holiday.holidayDate.slice(0, 10) >= todayKey,
      )
      .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  }, [
    employeeHolidays.hasEmployeeRecord,
    employeeHolidays.summary,
    employeeHolidays.mandatoryHolidays,
    employeeHolidays.selections,
    holidays.holidays,
    todayKey,
  ]);

  const upcomingHolidays = effectiveHolidays.slice(0, 3);

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
        <PageShell>
          <Screen4Calendar />
        </PageShell>
      ) : activeTopTab === 'Dashboard' ? (
        /* Top-Level Tab: Executive Dashboard */
        <PageShell className="relative z-20 -mt-16" gap="none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 xl:col-span-3">
              <EmployeeProfilePanel />
            </div>
            <div className="lg:col-span-8 xl:col-span-9 space-y-4 min-w-0">
              <OverviewDashboardTab onNavigateModule={onNavigateModule} />
            </div>
          </div>
        </PageShell>
      ) : (
        /* Top-Level Tab: Standard Overview */
        <PageShell className="relative z-20 -mt-16" gap="none">
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

                  <CompanyDocumentsCard />
                </>
              )}

              {/* Tab 2: Feeds (Commented out until real backend persistence is connected) */}
              {/* {activeSubTab === 'Feeds' && <OverviewFeedsTab />} */}

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
        </PageShell>
      )}
    </div>
  );
}
