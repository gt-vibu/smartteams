import type { Prisma } from '../../generated/prisma/client';
import {
  approvalLocalDate,
  automaticApproval,
  validateAutomation,
} from '../approvals/approval-automation';

export async function shouldAutoApproveLeave(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    source: string;
    branchId: string;
    employeeId: string;
    leaveTypeId: string;
    start: Date;
    end: Date;
    days: number;
    automation: unknown;
  },
) {
  if (input.source !== 'NATIVE') return false;
  const rule = validateAutomation('LEAVE', input.automation);
  if (rule.mode === 'MANUAL') return false;
  const today = await approvalLocalDate(tx, organizationId, input.branchId);
  const eligible = automaticApproval(rule, {
    today,
    branchId: input.branchId,
    leaveTypeId: input.leaveTypeId,
    leaveDays: input.days,
    noticeDays: Math.floor((input.start.getTime() - Date.parse(today)) / 86400000),
  });
  if (!eligible) return false;
  const worked = await tx.attendanceRecord.count({
    where: {
      organizationId,
      employeeId: input.employeeId,
      workDate: { gte: input.start, lte: input.end },
      punches: { some: {} },
    },
  });
  return worked === 0;
}
