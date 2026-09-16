import { AttendanceDayStatus } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Propagates an approved leave decision onto the attendance calendar.
 *
 * `AttendanceDayStatus.ON_LEAVE` existed in the schema but nothing ever wrote it, so an approved
 * leave day was simply missing from attendance — neither present nor absent, just a hole. The
 * punch service already refuses to set that status itself, saying absence and leave "must be
 * recorded by their workflows"; this is that workflow.
 *
 * The relationship between the two tables is the one the schema already declares —
 * `AttendanceRecord @@unique([employeeId, workDate])` — not a new foreign key. Leave stays the
 * source of truth for *why* a day is non-working; attendance records *that* it is.
 *
 * Payroll is deliberately untouched by this. It reads `LeaveRequest` directly and always has, so
 * these rows change what the attendance screens show without moving a single number on a payslip.
 */

/** Every date in an inclusive range, stepped in UTC so a local offset cannot skip or repeat a day. */
export function leaveDates(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
  );
  const last = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  // Bounded independently of the loop body: a malformed range must not spin.
  while (cursor.getTime() <= last && dates.length <= 366) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Marks each day of an approved request as `ON_LEAVE`.
 *
 * A day that already carries punches is left alone. Someone who actually clocked in has real
 * attendance, and overwriting it here would destroy the record while claiming to improve it —
 * that disagreement belongs to the correction workflow, which is built to arbitrate it.
 */
export async function markLeaveDaysOnAttendance(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  request: {
    id: string;
    employeeId: string;
    branchId: string | null;
    startDate: Date;
    endDate: Date;
  },
): Promise<number> {
  let written = 0;
  for (const workDate of leaveDates(request.startDate, request.endDate)) {
    const existing = await tx.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: request.employeeId, workDate } },
      select: { id: true, dayStatus: true, _count: { select: { punches: true } } },
    });

    if (!existing) {
      await tx.attendanceRecord.create({
        data: {
          organizationId: context.organizationId,
          employeeId: request.employeeId,
          branchId: request.branchId,
          workDate,
          dayStatus: AttendanceDayStatus.ON_LEAVE,
          workedMinutes: 0,
          sourceAccessMode: context.accessMode,
          correctionNote: `Approved leave ${request.id}`,
        },
      });
      written += 1;
      continue;
    }

    if (existing._count.punches > 0) continue;
    if (existing.dayStatus === AttendanceDayStatus.ON_LEAVE) continue;

    await tx.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        dayStatus: AttendanceDayStatus.ON_LEAVE,
        correctionNote: `Approved leave ${request.id}`,
        version: { increment: 1 },
      },
    });
    written += 1;
  }
  return written;
}

/**
 * Undoes the above when an approved request is cancelled.
 *
 * Only rows this workflow could have written are touched: `ON_LEAVE` and no punches. A row that
 * has since gained punches, or been moved to another status, was changed by somebody else and is
 * theirs to own. Deleting rather than resetting to `PRESENT` is what restores the state that
 * actually preceded the approval — there was no record at all.
 */
export async function clearLeaveDaysOnAttendance(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  request: { employeeId: string; startDate: Date; endDate: Date },
): Promise<number> {
  let cleared = 0;
  for (const workDate of leaveDates(request.startDate, request.endDate)) {
    const existing = await tx.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: request.employeeId, workDate } },
      select: {
        id: true,
        organizationId: true,
        dayStatus: true,
        _count: { select: { punches: true, corrections: true, timesheetEntries: true } },
      },
    });
    if (!existing) continue;
    // Tenant-checked explicitly as well as by row-level security: this deletes rows.
    if (existing.organizationId !== context.organizationId) continue;
    if (existing.dayStatus !== AttendanceDayStatus.ON_LEAVE) continue;
    if (
      existing._count.punches > 0 ||
      existing._count.corrections > 0 ||
      existing._count.timesheetEntries > 0
    )
      continue;

    await tx.attendanceRecord.delete({ where: { id: existing.id } });
    cleared += 1;
  }
  return cleared;
}
