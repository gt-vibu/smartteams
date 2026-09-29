/**
 * What a day was for one employee, decided the same way on every screen.
 *
 * The Home work schedule, the attendance timeline and the calendar each used to decide this on
 * their own, so they disagreed: the schedule ran backwards and dropped weekends, the timeline
 * left out every day without a record, and the calendar showed a missed working day as blank.
 * They now all ask this one function.
 *
 * The order matters. Time actually worked wins over everything; then approved leave, a holiday
 * and a weekly off; then a working day that has gone by with nothing recorded, which is absent
 * only when the organization counts unmarked days as absent and only from the day the person
 * joined. A day still to come is upcoming, never absent.
 */

export type ResolvedDayStatus =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'ABSENT'
  | 'UPCOMING'
  | 'TODAY'
  | 'EMPTY';

export type DayFacts = {
  dateKey: string;
  todayKey: string;
  /** The API's `dayStatus` for this day's record, when there is one. */
  recordStatus?: string | null;
  workedMinutes?: number;
  leaveName?: string | null;
  holidayName?: string | null;
  isWeeklyOff: boolean;
  /** Whether a working day with nothing recorded counts as absent (an organization setting). */
  unmarkedDaysAreAbsent: boolean;
  /** `YYYY-MM-DD`; no day before it, and no day at all while it is unknown, can be absent. */
  joinedOn?: string | null;
};

export function resolveDayStatus(day: DayFacts): ResolvedDayStatus {
  const status = day.recordStatus ?? null;
  if (status === 'HALF_DAY') return 'HALF_DAY';
  if (
    status === 'PRESENT' ||
    status === 'ON_DUTY' ||
    status === 'LATE' ||
    (day.workedMinutes ?? 0) > 0
  )
    return 'PRESENT';
  if (day.leaveName || status === 'LEAVE' || status === 'ON_LEAVE') return 'LEAVE';
  if (day.holidayName || status === 'HOLIDAY') return 'HOLIDAY';
  if (day.isWeeklyOff || status === 'WEEKEND') return 'WEEKEND';
  if (day.dateKey > day.todayKey) return 'UPCOMING';
  if (day.dateKey === day.todayKey) return 'TODAY';
  if (status === 'ABSENT') return 'ABSENT';
  // Without a joining date there is no telling whether they worked here yet: say nothing.
  const joined = Boolean(day.joinedOn) && day.dateKey >= (day.joinedOn ?? '').slice(0, 10);
  return day.unmarkedDaysAreAbsent && joined ? 'ABSENT' : 'EMPTY';
}

/** The words a day's status is shown with; a holiday or leave says which one. */
export function dayStatusLabel(
  status: ResolvedDayStatus,
  names: { leaveName?: string | null; holidayName?: string | null } = {},
): string {
  switch (status) {
    case 'PRESENT':
      return 'Present';
    case 'HALF_DAY':
      return 'Half day';
    case 'LEAVE':
      return names.leaveName ?? 'On leave';
    case 'HOLIDAY':
      return names.holidayName ?? 'Holiday';
    case 'WEEKEND':
      return 'Weekend';
    case 'ABSENT':
      return 'Absent';
    case 'TODAY':
      return 'Today';
    default:
      return '';
  }
}

/** Every `YYYY-MM-DD` from `from` to `to` inclusive, oldest first. UTC arithmetic, so no day slips. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  for (
    let day = new Date(`${from}T00:00:00.000Z`), guard = 0;
    day.getTime() <= end && guard < 62;
    guard += 1
  ) {
    dates.push(day.toISOString().slice(0, 10));
    day = new Date(day.getTime() + 86_400_000);
  }
  return dates;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon" and 28 for `2026-09-28`, read as a calendar date rather than a UTC instant. */
export function dayParts(dateKey: string): { dayOfWeek: string; dayNumber: number } {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return { dayOfWeek: DAY_NAMES[date.getUTCDay()] ?? '', dayNumber: date.getUTCDate() };
}
