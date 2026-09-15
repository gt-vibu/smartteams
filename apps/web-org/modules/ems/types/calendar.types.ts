export type CalendarDayStatus = 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'WEEKEND' | 'UPCOMING' | 'EMPTY';

export interface CalendarDayItem {
  date: string; // "2026-08-01"
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday?: boolean;
  dayStatus: CalendarDayStatus;
  /**
   * The attendance record this day was built from, when the server returned one.
   *
   * A correction is raised against a record, so a day with no attendance has nothing to correct —
   * which is why this is optional rather than defaulted to an empty string.
   */
  attendanceRecordId?: string;
  /** The open check-in of a past day that never had a check-out, as an ISO instant. */
  openCheckInAt?: string;
  hoursLabel?: string; // "08:15 Hrs"
  holidayName?: string;
  isRestrictedHoliday?: boolean;
  shiftName?: string;
  punches?: Array<{
    type: 'IN' | 'OUT';
    time: string;
    source: string;
  }>;
}

export interface MonthCalendarData {
  monthName: string; // "Aug 2026"
  year: number;
  month: number;
  days: CalendarDayItem[];
}
