import { ConflictError } from '../../common/errors/domain-error';
import { workDateInTimeZone } from './attendance-shared';

/** Reject employee correction requests for days or punch instants beyond the organisation's clock. */
export function assertCorrectionIsNotFuture(
  workDate: Date | string,
  punchTimes: Array<Date | undefined>,
  timeZone: string,
  now = new Date(),
) {
  const workDateKey =
    typeof workDate === 'string' ? workDate.slice(0, 10) : workDate.toISOString().slice(0, 10);
  const todayKey = workDateInTimeZone(now, timeZone);
  if (workDateKey > todayKey)
    throw new ConflictError('Attendance corrections cannot be submitted for a future date');
  if (punchTimes.some((time) => time && time.getTime() > now.getTime()))
    throw new ConflictError('Attendance check-in and check-out times cannot be in the future');
}
