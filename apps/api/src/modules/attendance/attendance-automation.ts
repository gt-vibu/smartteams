import { approvalAutomationSchema } from '@smarteam/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { approvalTimeZone, automaticApproval } from '../approvals/approval-automation';
import { evaluateEmployeeWorkingDay } from '../shifts/working-day-evaluation';
import {
  attendanceTotals,
  correctionPunchUpdates,
  snapshotRecord,
  workDateInTimeZone,
} from './attendance-shared';

/** Missing evidence, added punches, non-working days, and overtime always go to individual review. */
export async function shouldAutoApproveCorrection(
  tx: Prisma.TransactionClient,
  organizationId: string,
  recordId: string,
  automation: unknown,
  after: unknown,
  now = new Date(),
  existingCorrectionId?: string,
) {
  const rule = approvalAutomationSchema.safeParse(automation ?? {});
  if (!rule.success || rule.data.mode === 'MANUAL') return false;
  const record = await tx.attendanceRecord.findFirst({
    where: { id: recordId, organizationId },
    include: { punches: true },
  });
  if (!record || record.punches.length < 2) return false;
  const calendar = await evaluateEmployeeWorkingDay(
    tx,
    organizationId,
    record.employeeId,
    record.workDate,
  );
  if (!calendar.isWorkingDay || calendar.expectedMinutes <= 0) return false;
  const snapshot = snapshotRecord(after);
  if (
    !snapshot ||
    snapshot.missingCheckOut ||
    snapshot.isNonWorkingDay ||
    record.overtimeMinutes > 0
  )
    return false;
  if (snapshot.dayStatus !== undefined && snapshot.dayStatus !== record.dayStatus) return false;
  const updates = correctionPunchUpdates(record.punches, after);
  if (!updates.length) return false;
  const byId = new Map(updates.map((update) => [update.id, update.occurredAt]));
  const changes = updates.map(
    (update) =>
      Math.abs(
        update.occurredAt.getTime() -
          record.punches.find((p) => p.id === update.id)!.occurredAt.getTime(),
      ) / 60000,
  );
  const totals = attendanceTotals(
    record.punches.map((p) => ({ ...p, occurredAt: byId.get(p.id) ?? p.occurredAt })),
    calendar.expectedMinutes,
  );
  if (!totals.completed || totals.overtimeMinutes > 0 || totals.workedMinutes > 1440) return false;
  const timeZone = await approvalTimeZone(tx, organizationId, record.branchId);
  const today = workDateInTimeZone(now, timeZone);
  const localDay = new Date(`${today}T00:00:00Z`);
  const corrections = await tx.attendanceCorrection.findMany({
    where: {
      organizationId,
      attendanceRecord: { employeeId: record.employeeId },
      ...(existingCorrectionId ? { id: { not: existingCorrectionId } } : {}),
      createdAt: {
        gte: new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 86400000),
        lte: now,
      },
    },
    select: { createdAt: true },
  });
  return automaticApproval(
    automation,
    {
      branchId: record.branchId,
      today,
      correctionAgeDays: Math.floor((localDay.getTime() - record.workDate.getTime()) / 86400000),
      changedMinutes: Math.max(...changes),
      correctionsThisMonth:
        corrections.filter(
          (row) => workDateInTimeZone(row.createdAt, timeZone).slice(0, 7) === today.slice(0, 7),
        ).length + 1,
    },
    now,
  );
}
