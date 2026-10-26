import { AttendancePunchType } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';
import { snapshotRecord } from './attendance-shared';

/**
 * A correction that supplies the check-out a day never had.
 *
 * The existing correction could only *move* a punch, so a day that ended on a check-in — someone
 * forgot to punch out — could not be repaired: asking for a check-out time was refused with
 * "check-out punch is missing", and a reason-only correction changed nothing when approved. The day
 * stayed open and counted no worked time.
 *
 * This is PRD FR-23 ("manager adjusts a missed punch"), and it deliberately invents nothing: there
 * is no automatic close, no assumed shift end, no default hours. The time is the one the employee
 * states, and it takes effect only when the correction's final approver accepts it.
 *
 * The requested time travels in the correction's after-snapshot under this key. It is honoured only
 * for a correction raised by a person in the application — never one raised by a federation client
 * — so the shared correction path federation uses behaves exactly as it did before.
 */
export const MISSING_CHECK_OUT_KEY = 'missingCheckOut';

/** A check-out more than this long after the check-in is not accepted: a shift fits in a day. */
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

export type PunchLike = { punchType: AttendancePunchType; occurredAt: Date };

/** The check-out time a missing-check-out correction asks for, if it is one. */
export function missingCheckOutFrom(snapshot: unknown): Date | undefined {
  const value = snapshotRecord(snapshotRecord(snapshot)?.[MISSING_CHECK_OUT_KEY]);
  if (!value || typeof value.occurredAt !== 'string') return undefined;
  const occurredAt = new Date(value.occurredAt);
  return Number.isNaN(occurredAt.getTime()) ? undefined : occurredAt;
}

/**
 * Refuses a check-out that could not have happened.
 *
 * Checked when the correction is raised, and again at final approval against the punches as they
 * are then — the day may have been corrected, or punched by an administrator, in between.
 *
 * @param punches the day's punches, oldest first
 * @param nextPunchAt the employee's first punch after this day's open check-in, on any day
 */
export function assertValidMissingCheckOut(
  punches: PunchLike[],
  checkOut: Date,
  now: Date,
  nextPunchAt?: Date,
): void {
  const last = punches.at(-1);
  if (!last) throw new ConflictError('This day has no check-in to add a check-out to');
  if (last.punchType !== AttendancePunchType.IN)
    throw new ConflictError('This day already has a check-out; correct that punch instead');
  if (checkOut.getTime() <= last.occurredAt.getTime())
    throw new ConflictError('The check-out must be after the check-in');
  if (checkOut.getTime() > now.getTime())
    throw new ConflictError('The check-out cannot be in the future');
  if (checkOut.getTime() - last.occurredAt.getTime() > MAX_SHIFT_MS)
    throw new ConflictError('The check-out must be within 24 hours of the check-in');
  if (nextPunchAt && checkOut.getTime() >= nextPunchAt.getTime())
    throw new ConflictError('The check-out must be before your next recorded punch');
}
