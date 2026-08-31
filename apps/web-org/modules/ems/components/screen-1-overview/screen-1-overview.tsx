'use client';

import React, { useState } from 'react';
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
import holidaysFixture from '../../data/fixtures/holidays.json';
import type { DailyAttendanceItem } from '../../types/attendance.types';
import { formatDateLabel } from '../../utils/formatters';

interface Screen1OverviewProps {
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
}

export function Screen1Overview({ onNavigateModule }: Screen1OverviewProps) {
  const [activeTopTab, setActiveTopTab] = useState('Overview');
  const [activeSubTab, setActiveSubTab] = useState('Activities');
  const { employee } = useEmployee();
  const { records } = useAttendance();
  const { approvedNotification } = useTimesheet();

  const shiftInfo = {
    id: 'shift_general',
    code: 'GEN',
    name: 'General Shift',
    startsAt: '10:00 AM',
    endsAt: '6:00 PM',
  };

  // Convert attendance records to week schedule format
  const weekScheduleDays: DailyAttendanceItem[] = records.map((r) => ({
    id: r.id,
    workDate: r.workDate,
    dayOfWeek: r.dayOfWeek,
    dayNumber: r.dayNumber,
    dayStatus:
      r.dayStatus === 'LEAVE'
        ? 'ON_LEAVE'
        : r.dayStatus === 'ON_DUTY'
          ? 'PRESENT'
          : r.dayStatus === 'EMPTY'
            ? 'ABSENT'
            : r.dayStatus,
    workedMinutes: r.workedMinutes,
    isToday: r.isToday,
  }));
  const scheduleDates = records.map((record) => record.workDate).sort();
  const scheduleStartDate = scheduleDates[0] ? formatDateLabel(scheduleDates[0]) : 'Current period';
  const scheduleEndDate = scheduleDates[scheduleDates.length - 1]
    ? formatDateLabel(scheduleDates[scheduleDates.length - 1]!)
    : '';

  const handleSelectSubTab = (tab: string) => {
    // Retain inline preview state without forcefully redirecting away
    setActiveSubTab(tab);
  };

  const handleSelectTopTab = (tab: string) => {
    setActiveTopTab(tab);
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
                  <GreetingCard employee={employee} />

                  {approvedNotification && (
                    <TimesheetStatusCard notification={approvedNotification} />
                  )}

                  <WorkScheduleCard
                    shift={shiftInfo}
                    startDate={scheduleStartDate}
                    endDate={scheduleEndDate}
                    attendanceDays={weekScheduleDays}
                  />

                  <UpcomingHolidaysCard holidays={holidaysFixture.holidays} />
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
