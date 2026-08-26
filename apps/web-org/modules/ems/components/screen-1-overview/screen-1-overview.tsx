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
import { Screen4Calendar } from '../screen-4-calendar/screen-4-calendar';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { useTimesheet } from '../../hooks/use-timesheet';
import holidaysFixture from '../../data/fixtures/holidays.json';

interface Screen1OverviewProps {
  onNavigateModule?: (module: 'home' | 'attendance' | 'timesheet' | 'time-off', subView?: 'timeline' | 'table' | 'calendar') => void;
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
  const weekScheduleDays = records.map((r) => ({
    id: r.id,
    workDate: r.workDate,
    dayOfWeek: r.dayOfWeek,
    dayNumber: r.dayNumber,
    dayStatus: r.dayStatus as any,
    workedMinutes: r.workedMinutes,
    isToday: r.isToday,
  }));

  const handleSelectSubTab = (tab: string) => {
    setActiveSubTab(tab);
    if (tab === 'Attendance') {
      onNavigateModule?.('attendance', 'timeline');
    } else if (tab === 'Leave') {
      onNavigateModule?.('time-off');
    } else if (tab === 'Time Logs' || tab === 'Timesheets') {
      onNavigateModule?.('timesheet');
    }
  };

  const handleSelectTopTab = (tab: string) => {
    setActiveTopTab(tab);
  };

  return (
    <div className="w-full max-w-full pb-14 bg-[#EEF2F6] min-h-full">
      {/* 1. Full-Width Hero Banner */}
      <HeroBanner
        activeTab={activeTopTab}
        onSelectTab={handleSelectTopTab}
      />

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
              <SubNavTabs
                activeTab={activeSubTab}
                onSelectTab={handleSelectSubTab}
              />

              {/* Tab 1: Activities (Default Home Feed) */}
              {activeSubTab === 'Activities' && (
                <>
                  <GreetingCard employee={employee} />

                  {approvedNotification && (
                    <TimesheetStatusCard notification={approvedNotification} />
                  )}

                  <WorkScheduleCard
                    shift={shiftInfo}
                    startDate="23-Aug-2026"
                    endDate="29-Aug-2026"
                    attendanceDays={weekScheduleDays}
                  />

                  <UpcomingHolidaysCard holidays={holidaysFixture.holidays as any} />
                </>
              )}

              {/* Tab 2: Feeds */}
              {activeSubTab === 'Feeds' && (
                <OverviewFeedsTab />
              )}

              {/* Tab 3: Full Profile */}
              {activeSubTab === 'Profile' && (
                <OverviewProfileTab />
              )}

              {/* Tab 4: Approvals */}
              {activeSubTab === 'Approvals' && (
                <OverviewApprovalsTab />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


