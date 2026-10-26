export interface TimelineDayRecord {
  id: string;
  dayLabel: string; // "Sun 23", "Mon 24", "Today 25"
  dayOfWeek: string;
  dayNumber: number;
  isToday?: boolean;
  firstInTime?: string;
  lastOutTime?: string;
  workedMinutes: number;
  /**
   * Minutes worked so far on a day whose punch is still open, including any earlier closed pairs.
   *
   * `workedMinutes` only counts an IN once an OUT has closed it, so a day someone is still working
   * reports zero until they check out. Undefined whenever the day is settled.
   */
  inProgressMinutes?: number;
  /** A past day that ended on a check-in: no check-out was ever recorded, so no time counts. */
  checkOutMissing?: boolean;
  /**
   * ABSENT is a working day gone by with nothing recorded, where the organization counts that as
   * absent; UPCOMING a day still to come; EMPTY anything else with nothing to show.
   */
  status: 'PRESENT' | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'ABSENT' | 'UPCOMING' | 'EMPTY';
  holidayName?: string;
  /** The approved leave covering the day, by leave type name. */
  leaveName?: string;
  isRestrictedHoliday?: boolean;
  /**
   * A check-in on the employee's approved optional holiday: the row shows this label and colour
   * instead of an ordinary present day.
   */
  holidayConflict?: { label: string; detail: string; tone: 'attention' | 'holiday' | 'working' };
  // Where the punches fall, as a percentage of the whole 24-hour day.
  spanStartPercent?: number;
  spanEndPercent?: number;
}

export interface AttendanceSummaryStats {
  presentDays: number;
  leaveDays: number;
  holidayDays: number;
  weekendDays: number;
  /** Minutes worked across the days shown, from closed check-in/check-out pairs. */
  workedMinutes: number;
}
