import type { LeaveRequest, LeaveType } from '@smarteam/contracts';

/** Each calendar day (YYYY-MM-DD) covered by an approved leave, mapped to the leave type's name. */
export function approvedLeaveByDate(
  requests: readonly LeaveRequest[],
  types: readonly LeaveType[],
): Map<string, string> {
  const names = new Map(types.map((type) => [type.id, type.name]));
  const byDate = new Map<string, string>();
  for (const request of requests) {
    if (request.status !== 'APPROVED') continue;
    const name = names.get(request.leaveTypeId) ?? 'Leave';
    const start = new Date(`${request.startDate.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${request.endDate.slice(0, 10)}T00:00:00Z`);
    // Bounded, so a malformed range cannot spin: no leave runs longer than a year.
    for (let day = start, guard = 0; day <= end && guard < 366; guard += 1) {
      byDate.set(day.toISOString().slice(0, 10), name);
      day = new Date(day.getTime() + 86_400_000);
    }
  }
  return byDate;
}
