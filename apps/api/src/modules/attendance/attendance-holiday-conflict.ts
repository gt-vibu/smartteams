import type { Prisma } from '../../generated/prisma/client';

/**
 * A check-in on a granted optional holiday, and where its resolution stands.
 *
 * An employee whose optional holiday is CONFIRMED can still check in that day — they may have been
 * asked to come in. The check-in is always accepted; the day is then both a granted holiday and a
 * worked day, and only a manager's decision says which one it is. Nothing here is a stored flag:
 * the state is read from the selection, the attendance record and the review, so a later change
 * to any of them shows up rather than being hidden behind a stale marker.
 *
 *  - AWAITING_REASON    the holiday is still granted and the day has punches; the employee has not
 *                       yet explained the check-in (or a kept holiday was reopened by a later
 *                       correction that re-totalled the day).
 *  - AWAITING_DECISION  the employee's explanation is waiting for a manager.
 *  - HOLIDAY_KEPT       a manager kept the holiday: the punches stay as history, the day counts no
 *                       worked time.
 *  - CONVERTED_TO_WORKING_DAY  a manager cancelled the holiday; the day is an ordinary working day.
 */
export type HolidayConflictState =
  'AWAITING_REASON' | 'AWAITING_DECISION' | 'HOLIDAY_KEPT' | 'CONVERTED_TO_WORKING_DAY';

export type ConflictSelection = {
  id: string;
  employeeId: string;
  holidayId: string;
  status: string;
  holiday: { id: string; name: string; holidayDate: Date; isOptional: boolean; isActive: boolean };
};

export type ConflictRecord = {
  id: string;
  employeeId: string;
  workDate: Date;
  status: string;
  workedMinutes: number;
  overtimeMinutes: number;
  punchCount: number;
};

export type ConflictReview = {
  id: string;
  attendanceRecordId: string;
  selectionId: string;
  status: string;
  outcome: string | null;
  reason: string;
  comment: string | null;
  decisionComment: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The conflict state of one attendance record against one selection for the same employee and
 * date, or null when there is no conflict to show.
 *
 * `reviews` are this record's reviews, newest first.
 */
export function holidayConflictState(
  record: ConflictRecord,
  selection: ConflictSelection,
  reviews: readonly ConflictReview[],
): HolidayConflictState | null {
  if (record.employeeId !== selection.employeeId) return null;
  if (dateKey(record.workDate) !== dateKey(selection.holiday.holidayDate)) return null;
  if (!selection.holiday.isOptional) return null;
  const forSelection = reviews.filter((review) => review.selectionId === selection.id);
  const decided = forSelection.find((review) => review.status === 'APPROVED');
  if (selection.status === 'CANCELLED') {
    // Only a cancellation this workflow made is shown; a holiday the employee cancelled
    // themselves before the day is simply not a holiday.
    return decided?.outcome === 'CONVERT_TO_WORKING_DAY' ? 'CONVERTED_TO_WORKING_DAY' : null;
  }
  if (selection.status !== 'CONFIRMED' || !selection.holiday.isActive) return null;
  if (record.punchCount === 0) return null;
  // A kept holiday holds only while the record still says so. A correction approved afterwards
  // re-totals the day and moves it off REJECTED; that reopens the conflict instead of letting the
  // day count as both a holiday and worked time.
  if (record.status === 'REJECTED' && decided?.outcome === 'KEEP_HOLIDAY') return 'HOLIDAY_KEPT';
  if (forSelection.some((review) => review.status === 'PENDING')) return 'AWAITING_DECISION';
  return 'AWAITING_REASON';
}

const selectionInclude = {
  holiday: {
    select: { id: true, name: true, holidayDate: true, isOptional: true, isActive: true },
  },
} as const;

/**
 * Every optional-holiday conflict for the given employees and dates, newest first.
 *
 * `employeeId` undefined means every employee the caller may already see; the caller narrows it.
 */
export async function loadHolidayConflicts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  filters: { employeeId?: string; from: Date; to: Date; branchId?: string; recordId?: string },
) {
  const selections = await tx.employeeHolidaySelection.findMany({
    where: {
      organizationId,
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      status: { in: ['CONFIRMED', 'CANCELLED'] },
      holiday: { isOptional: true, holidayDate: { gte: filters.from, lte: filters.to } },
    },
    include: selectionInclude,
    take: 1000,
  });
  if (selections.length === 0) return [];
  const records = await tx.attendanceRecord.findMany({
    where: {
      organizationId,
      ...(filters.recordId ? { id: filters.recordId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      OR: selections.map((selection) => ({
        employeeId: selection.employeeId,
        workDate: selection.holiday.holidayDate,
      })),
    },
    include: {
      _count: { select: { punches: true } },
      punches: { orderBy: { occurredAt: 'asc' }, select: { punchType: true, occurredAt: true } },
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
  });
  if (records.length === 0) return [];
  const reviews = await tx.attendanceHolidayReview.findMany({
    where: { organizationId, attendanceRecordId: { in: records.map((record) => record.id) } },
    orderBy: { createdAt: 'desc' },
  });
  const conflicts = [];
  for (const record of records) {
    const recordReviews = reviews.filter((review) => review.attendanceRecordId === record.id);
    for (const selection of selections) {
      const state = holidayConflictState(
        { ...record, punchCount: record._count.punches },
        selection,
        recordReviews,
      );
      if (!state) continue;
      const review =
        recordReviews.find(
          (candidate) =>
            candidate.selectionId === selection.id &&
            (state === 'AWAITING_DECISION'
              ? candidate.status === 'PENDING'
              : candidate.status === 'APPROVED'),
        ) ?? null;
      conflicts.push({
        attendanceId: record.id,
        employeeId: record.employeeId,
        employee: record.employee,
        workDate: dateKey(record.workDate),
        selectionId: selection.id,
        holiday: {
          id: selection.holiday.id,
          name: selection.holiday.name,
          date: dateKey(selection.holiday.holidayDate),
        },
        state,
        attendance: {
          status: record.status,
          workedMinutes: record.workedMinutes,
          overtimeMinutes: record.overtimeMinutes,
          punches: record.punches.map((punch) => ({
            type: punch.punchType,
            occurredAt: punch.occurredAt.toISOString(),
          })),
        },
        review: review && {
          id: review.id,
          status: review.status,
          outcome: review.outcome,
          reason: review.reason,
          comment: review.comment,
          decisionComment: review.decisionComment,
          decidedAt: review.decidedAt?.toISOString() ?? null,
          createdAt: review.createdAt.toISOString(),
        },
      });
    }
  }
  return conflicts.sort((a, b) => b.workDate.localeCompare(a.workDate));
}

export type HolidayConflict = Awaited<ReturnType<typeof loadHolidayConflicts>>[number];
