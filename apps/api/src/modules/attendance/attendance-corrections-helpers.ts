import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import {
  MISSING_CHECK_OUT_KEY,
  missingCheckOutFrom,
  type PunchLike,
} from './attendance-missing-checkout';

/** The employee's first punch after this day's open check-in, on any day. */
export async function nextPunchAfterOpenCheckIn(
  tx: Prisma.TransactionClient,
  record: { id: string; organizationId: string; employeeId: string; punches: PunchLike[] },
): Promise<Date | undefined> {
  const openAt = record.punches.at(-1)?.occurredAt;
  if (!openAt) return undefined;
  const next = await tx.attendancePunch.findFirst({
    where: {
      organizationId: record.organizationId,
      employeeId: record.employeeId,
      attendanceRecordId: { not: record.id },
      occurredAt: { gt: openAt },
    },
    orderBy: { occurredAt: 'asc' },
    select: { occurredAt: true },
  });
  return next?.occurredAt;
}

/**
 * The correction's snapshot with the approver's check-out time in place of the proposed one.
 *
 * Only for a correction that adds a check-out, and only for one raised inside the application:
 * a federation client's correction is decided exactly as before.
 */
export function replaceMissingCheckOut(
  correction: { requestedByClientId: string | null; afterSnapshot: unknown },
  checkOutAt: string,
): Record<string, unknown> {
  if (correction.requestedByClientId)
    throw new ConflictError('This correction cannot have its check-out time replaced');
  const proposed = missingCheckOutFrom(correction.afterSnapshot);
  if (!proposed) throw new ConflictError('This correction does not add a check-out');
  const replacement = new Date(checkOutAt);
  if (Number.isNaN(replacement.getTime())) throw new ConflictError('The check-out time is invalid');
  const snapshot = correction.afterSnapshot as Record<string, unknown>;
  const existing = snapshot[MISSING_CHECK_OUT_KEY] as Record<string, unknown>;
  return {
    ...snapshot,
    [MISSING_CHECK_OUT_KEY]: { ...existing, occurredAt: replacement.toISOString() },
  };
}

export function attendanceDate(value: string) {
  const dateValue = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue))
    throw new ConflictError('Attendance work date must be a valid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue)
    throw new ConflictError('Attendance work date must be a valid calendar date');
  return date;
}
