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
  status: 'PRESENT' | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'EMPTY';
  holidayName?: string;
  isRestrictedHoliday?: boolean;
  // Visual bar span (percent of 10 AM - 6 PM scale)
  spanStartPercent?: number;
  spanEndPercent?: number;
}

export interface AttendanceSummaryStats {
  payableDays: number;
  presentDays: number;
  onDutyDays: number;
  paidLeaveDays: number;
  holidayDays: number;
  weekendDays: number;
}
