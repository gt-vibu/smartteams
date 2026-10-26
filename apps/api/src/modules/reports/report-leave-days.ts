import type { LeaveUnit } from '../leave/leave-units';
import { leaveUnitsOn } from '../leave/leave-units';

/** Charged-date snapshots keep reports consistent when calendars change later. */
export function reportLeaveDays(
  request: LeaveUnit & { requestedDays: unknown },
  from: Date,
  to: Date,
) {
  if (Array.isArray(request.chargedDates))
    return request.chargedDates.reduce<number>((sum, date) => {
      if (typeof date !== 'string') return sum;
      const day = new Date(`${date}T00:00:00Z`);
      return sum + (day >= from && day <= to ? leaveUnitsOn(request, day) : 0);
    }, 0);
  const start = Math.max(from.getTime(), request.startDate.getTime());
  const end = Math.min(to.getTime(), request.endDate.getTime());
  if (end < start) return 0;
  const totalDates = (request.endDate.getTime() - request.startDate.getTime()) / 86400000 + 1;
  // Legacy requests have no charged-day snapshot; prorate their recorded units across the span.
  return (Number(request.requestedDays) * ((end - start) / 86400000 + 1)) / totalDates;
}
