'use client';

import React, { useMemo } from 'react';
import type { Holiday } from '@smarteam/contracts';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { useTimesheet } from '../../hooks/use-timesheet';
import { useHolidays } from '../../hooks/use-holidays';
import { useEmployeeHolidays } from '../../hooks/use-employee-holidays';
import { useMyShift } from '../../hooks/use-my-shift';
import type { DailyAttendanceItem } from '../../types/attendance.types';
import { toDailyStatus } from '../../services/attendance-view';
import { formatDateLabel } from '../../utils/formatters';
import { GreetingCard } from './greeting-card';
import { TimesheetStatusCard } from './timesheet-status-card';
import { WorkScheduleCard } from './work-schedule-card';
import { UpcomingHolidaysCard } from './upcoming-holidays-card';
import { CompanyDocumentsCard } from './company-documents-card';

/**
 * The Activities tab: what is happening around the employee this week.
 *
 * Its own component so Home can place it in either layout — beside the profile on a laptop, as a
 * tab of its own on a phone — without the screen carrying every card's data derivation.
 */
interface OverviewActivitiesTabProps {
  /** Opens another module; the holiday card's "View all" goes to the holiday calendar. */
  onNavigateModule?: (module: string) => void;
}

export function OverviewActivitiesTab({ onNavigateModule }: OverviewActivitiesTabProps = {}) {
  const { employee } = useEmployee();
  const myShift = useMyShift();
  const { days: records } = useAttendance();
  const { approvedTimesheet } = useTimesheet();
  const holidays = useHolidays();
  const employeeHolidays = useEmployeeHolidays();

  // Effective holidays still ahead this year: mandatory ones plus the employee's confirmed picks.
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingHolidays: Holiday[] = useMemo(() => {
    const effective =
      employeeHolidays.hasEmployeeRecord && employeeHolidays.summary
        ? [
            ...employeeHolidays.mandatoryHolidays,
            ...employeeHolidays.selections
              .filter((selection) => selection.status === 'CONFIRMED' && selection.holiday)
              .map((selection) => selection.holiday!),
          ]
        : holidays.holidays.filter((holiday) => !holiday.isOptional);
    return effective
      .filter((holiday) => holiday.isActive && holiday.holidayDate.slice(0, 10) >= todayKey)
      .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
      .slice(0, 3);
  }, [
    employeeHolidays.hasEmployeeRecord,
    employeeHolidays.summary,
    employeeHolidays.mandatoryHolidays,
    employeeHolidays.selections,
    holidays.holidays,
    todayKey,
  ]);

  const weekScheduleDays: DailyAttendanceItem[] = records.map((record) => ({
    id: record.id,
    workDate: record.workDate,
    dayOfWeek: record.dayOfWeek,
    dayNumber: record.dayNumber,
    dayStatus: toDailyStatus(record.dayStatus),
    workedMinutes: record.workedMinutes,
    isToday: record.isToday,
  }));
  const scheduleDates = records.map((record) => record.workDate).sort();
  const first = scheduleDates[0];
  const last = scheduleDates[scheduleDates.length - 1];

  return (
    <div className="space-y-4">
      {employee && <GreetingCard employee={employee} />}
      {approvedTimesheet && <TimesheetStatusCard notification={approvedTimesheet} />}
      <WorkScheduleCard
        shift={myShift.shift}
        shiftStatus={myShift.loading ? 'loading' : myShift.error ? 'unavailable' : 'unassigned'}
        startDate={first ? formatDateLabel(first) : 'Current period'}
        endDate={last ? formatDateLabel(last) : ''}
        attendanceDays={weekScheduleDays}
      />
      <UpcomingHolidaysCard
        holidays={upcomingHolidays}
        loading={holidays.loading}
        unavailable={holidays.forbidden}
        {...(onNavigateModule ? { onViewAll: () => onNavigateModule('holidays') } : {})}
      />
      <CompanyDocumentsCard />
    </div>
  );
}
