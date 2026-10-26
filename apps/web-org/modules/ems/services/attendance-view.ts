import {
  firstPunch,
  formatMinutes,
  liveWorkedMinutes,
  workDateKey,
  type AttendanceCorrection,
  type AttendanceRecord,
  formatDate,
} from '@smarteam/contracts';
import type { HolidayConflictView } from './holiday-conflict-view';

/**
 * Presentation fields derived from an attendance record.
 *
 * Everything here is computed from what the API returned. Two fields the old fixture carried are
 * deliberately absent because nothing in the wired backend supplies them:
 *
 *  - `isRestrictedHoliday` — the holiday calendar is not reconciled yet. `holidayName` is set only
 *    for a check-in on the employee's approved optional holiday, from the API's conflict list.
 *  - `shiftCode` / `shiftName` — a record stores no shift; `useAttendance` fills the name from
 *    the employee's assignment history.
 *
 * They are null rather than invented, so a working day is never labelled as a holiday.
 */

export type AttendanceDayView = {
  id: string;
  workDate: string;
  dayLabel: string;
  dayOfWeek: string;
  dayNumber: number;
  isToday: boolean;
  isWeekend: boolean;
  firstInTime: string | null;
  lastOutTime: string | null;
  workedMinutes: number;
  workedLabel: string;
  overtimeLabel: string;
  dayStatus: string;
  /** An approved leave row and at least one real check-in exist for the same day. */
  leaveOverlap: boolean;
  /** Null until the shifts module is wired. */
  shiftName: string | null;
  /** The optional holiday this day's check-in landed on; null for any other day. */
  holidayName: string | null;
  /** Percentage across a 24-hour track, for the timeline. Null when there is no punch. */
  spanStartPercent: number | null;
  spanEndPercent: number | null;
  employeeName: string | null;
  employeeNumber: string | null;
  correctionStatus: string | null;
  /**
   * Set when the day is a check-in on the employee's approved optional holiday. Such a day is
   * shown by this state, never as a plain "Present".
   */
  holidayConflict: HolidayConflictView | null;
  record: AttendanceRecord;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parses `YYYY-MM-DD` as a local date; `new Date(string)` would read it as UTC and shift days. */
function localDate(key: string): Date {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function clockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Fraction of the day, 0–100, for placing a punch on a 24-hour track. */
function dayPercent(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return ((date.getHours() * 60 + date.getMinutes()) / (24 * 60)) * 100;
}

export function toAttendanceDayView(
  record: AttendanceRecord,
  options: {
    todayKey: string;
    correction?: AttendanceCorrection | undefined;
    holidayConflict?: HolidayConflictView | undefined;
    /** Counts an open session up to this moment, so the hours move while someone is working. */
    now?: number;
    /** ISO weekdays that are working days (1 Monday … 7 Sunday); the rest are weekly offs. */
    workWeekDays?: readonly number[];
  } = {
    todayKey: '',
  },
): AttendanceDayView {
  const key = workDateKey(record);
  const date = localDate(key);
  const weekday = date.getDay();
  const checkIn = firstPunch(record, 'IN');
  const checkOut = firstPunch(record, 'OUT');
  const worked = liveWorkedMinutes(record, options.now);
  const leaveOverlap =
    record.dayStatus === 'ON_LEAVE' && record.status !== 'REJECTED' && Boolean(checkIn);

  return {
    id: record.id,
    workDate: key,
    // "28 Sep": the day and month, as every other date in the app writes them.
    dayLabel: formatDate(date).split(' ').slice(0, 2).join(' '),
    dayOfWeek: DAY_NAMES[weekday] ?? '',
    dayNumber: date.getDate(),
    isToday: key === options.todayKey,
    // The company's weekly offs, not a fixed Saturday and Sunday.
    isWeekend: !(options.workWeekDays ?? [1, 2, 3, 4, 5]).includes(weekday === 0 ? 7 : weekday),
    firstInTime: clockTime(checkIn?.occurredAt),
    lastOutTime: clockTime(checkOut?.occurredAt),
    workedMinutes: worked,
    workedLabel: formatMinutes(worked),
    overtimeLabel: formatMinutes(record.overtimeMinutes),
    // A punch during leave remains under review; only the authorized overlap decision may mark
    // the day present. Keep the stored leave status until that decision is recorded.
    dayStatus: record.dayStatus,
    leaveOverlap,
    shiftName: null,
    holidayName: options.holidayConflict?.holidayName ?? null,
    spanStartPercent: dayPercent(checkIn?.occurredAt),
    spanEndPercent: dayPercent(checkOut?.occurredAt),
    employeeName: record.employee
      ? `${record.employee.firstName} ${record.employee.lastName}`.trim()
      : null,
    employeeNumber: record.employee?.employeeNumber ?? null,
    correctionStatus: options.correction?.status ?? null,
    holidayConflict: options.holidayConflict ?? null,
    record,
  };
}

export function toAttendanceDayViews(
  records: readonly AttendanceRecord[],
  todayKey: string,
  corrections: readonly AttendanceCorrection[] = [],
  holidayConflicts: ReadonlyMap<string, HolidayConflictView> = new Map(),
  now: number = Date.now(),
  workWeekDays: readonly number[] = [1, 2, 3, 4, 5],
): AttendanceDayView[] {
  // Most recent correction per attendance record, so a row can show that one is pending.
  const byRecord = new Map<string, AttendanceCorrection>();
  for (const correction of corrections) {
    const id = correction.attendanceId;
    if (id && !byRecord.has(id)) byRecord.set(id, correction);
  }
  return records
    .map((record) =>
      toAttendanceDayView(record, {
        todayKey,
        correction: byRecord.get(record.id),
        holidayConflict: holidayConflicts.get(record.id),
        now,
        workWeekDays,
      }),
    )
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
}

/**
 * Whether a correction can be raised for this day.
 *
 * A day with a correction already pending cannot have another; the API rejects it, and offering
 * the action anyway would produce an error the user cannot act on.
 */
export function canRequestCorrection(view: AttendanceDayView, hasPermission: boolean): boolean {
  return hasPermission && view.correctionStatus !== 'PENDING';
}

/** Totals for the summary footer, computed from the same records the rows show. */
export function attendanceTotals(views: readonly AttendanceDayView[]) {
  const present = views.filter((view) => view.workedMinutes > 0);
  const workedMinutes = views.reduce((sum, view) => sum + view.workedMinutes, 0);
  return {
    daysWithWork: present.length,
    workedMinutes,
    workedLabel: formatMinutes(workedMinutes),
    averageLabel: formatMinutes(present.length ? Math.round(workedMinutes / present.length) : 0),
  };
}

/**
 * The summary strip under the timeline and the table.
 *
 * A check-in on an approved optional holiday is not a present day until a manager converts it;
 * once they keep the holiday, it counts as a holiday.
 */
export function attendanceSummaryStats(views: readonly AttendanceDayView[]) {
  const present = (view: AttendanceDayView) =>
    ['PRESENT', 'LATE', 'HALF_DAY', 'ON_DUTY'].includes(view.dayStatus) &&
    (!view.holidayConflict || view.holidayConflict.state === 'CONVERTED_TO_WORKING_DAY');
  // No "payable days" or "on duty" figure: payable days depend on whether each leave was paid,
  // which payroll decides, and there is no on-duty record. A figure that could disagree with the
  // payslip, or is always zero, is worse than none.
  return {
    // A half day counts as half.
    presentDays: views
      .filter(present)
      .reduce(
        (sum, view) =>
          sum +
          Math.min(view.dayStatus === 'HALF_DAY' ? 0.5 : 1, 1 - (view.record.leaveUnits ?? 0)),
        0,
      ),
    leaveDays: views.reduce(
      (sum, view) =>
        sum + (view.record.leaveUnits ?? (['LEAVE', 'ON_LEAVE'].includes(view.dayStatus) ? 1 : 0)),
      0,
    ),
    workedMinutes: views.reduce((sum, view) => sum + (view.workedMinutes || 0), 0),
    holidayDays: views.filter(
      (view) => view.dayStatus === 'HOLIDAY' || view.holidayConflict?.state === 'HOLIDAY_KEPT',
    ).length,
    weekendDays: views.filter((view) => view.dayStatus === 'WEEKEND').length,
  };
}

/**
 * Maps the API's `dayStatus` onto the narrower unions the schedule and calendar widgets use.
 *
 * An unrecognised status becomes ABSENT/EMPTY rather than being coerced to PRESENT: showing a
 * day as worked when the server said something else would be the more damaging guess.
 */
export function toDailyStatus(
  dayStatus: string,
): 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'WEEKEND' | 'HOLIDAY' {
  switch (dayStatus) {
    case 'PRESENT':
    case 'ON_DUTY':
      return 'PRESENT';
    case 'LEAVE':
    case 'ON_LEAVE':
      return 'ON_LEAVE';
    case 'WEEKEND':
      return 'WEEKEND';
    case 'HOLIDAY':
      return 'HOLIDAY';
    case 'HALF_DAY':
      return 'HALF_DAY';
    case 'LATE':
      return 'LATE';
    default:
      return 'ABSENT';
  }
}

export function toCalendarStatus(
  dayStatus: string,
): 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'WEEKEND' | 'UPCOMING' | 'EMPTY' {
  switch (dayStatus) {
    case 'PRESENT':
    case 'ON_DUTY':
      return 'PRESENT';
    case 'WEEKEND':
      return 'WEEKEND';
    case 'HOLIDAY':
      return 'HOLIDAY';
    case 'EMPTY':
      return 'EMPTY';
    default:
      return 'ABSENT';
  }
}

/** The timeline track's narrower status union. */
export function toTimelineStatus(
  dayStatus: string,
): 'PRESENT' | 'WEEKEND' | 'HOLIDAY' | 'LEAVE' | 'EMPTY' {
  switch (dayStatus) {
    case 'PRESENT':
    case 'ON_DUTY':
      return 'PRESENT';
    case 'WEEKEND':
      return 'WEEKEND';
    case 'HOLIDAY':
      return 'HOLIDAY';
    case 'LEAVE':
    case 'ON_LEAVE':
      return 'LEAVE';
    default:
      return 'EMPTY';
  }
}
