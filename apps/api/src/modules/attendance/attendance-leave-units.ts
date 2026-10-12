import type { Prisma } from '../../generated/prisma/client';
import { leaveUnitsOn } from '../leave/leave-units';

/** A single scoped query for the displayed page; never expose reasons or documents. */
export async function attendanceLeaveUnits(
  tx: Prisma.TransactionClient,
  organizationId: string,
  records: ReadonlyArray<{ employeeId: string; workDate: Date }>,
) {
  const units = new Map<string, number>();
  if (!records.length) return units;
  const dates = records.map((record) => record.workDate.getTime());
  const leaves = await tx.leaveRequest.findMany({
    where: {
      organizationId,
      status: 'APPROVED',
      employeeId: { in: [...new Set(records.map((record) => record.employeeId))] },
      startDate: { lte: new Date(dates.reduce((max, date) => Math.max(max, date), -Infinity)) },
      endDate: { gte: new Date(dates.reduce((min, date) => Math.min(min, date), Infinity)) },
    },
    select: { employeeId: true, startDate: true, endDate: true, chargedDates: true, session: true },
  });
  const grouped = new Map<string, typeof leaves>();
  for (const leave of leaves)
    grouped.set(leave.employeeId, [...(grouped.get(leave.employeeId) ?? []), leave]);
  for (const record of records)
    units.set(
      `${record.employeeId}:${record.workDate.toISOString().slice(0, 10)}`,
      Math.min(
        1,
        (grouped.get(record.employeeId) ?? []).reduce(
          (sum, leave) => sum + leaveUnitsOn(leave, record.workDate),
          0,
        ),
      ),
    );
  return units;
}
