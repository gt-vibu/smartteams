import type { Prisma } from '../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { shouldAutoApproveCorrection } from '../attendance/attendance-automation';
import {
  approvalLocalDate,
  assertAutomationScope,
  automaticApproval,
  validateAutomation,
} from './approval-automation';

@Injectable()
export class ApprovalAutomationPreviewService {
  constructor(private readonly database: TenantDatabaseService) {}

  preview(
    context: DomainContext,
    input: { domain: string; automation: Record<string, unknown>; cursor?: string },
  ) {
    requirePermission(context, 'approval-policies.write');
    if (!['LEAVE', 'ATTENDANCE_CORRECTION'].includes(input.domain))
      throw new ConflictError('Preview is available for leave and attendance correction rules.');
    validateAutomation(input.domain, input.automation);
    return this.database.run(
      context,
      async (tx) => {
        return this.evaluate(tx, context, input);
      },
      { timeout: 30000 },
    );
  }
  async evaluate(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    input: { domain: string; automation: Record<string, unknown>; cursor?: string; ids?: string[] },
  ) {
    const rule = validateAutomation(input.domain, input.automation);
    await assertAutomationScope(tx, context.organizationId, rule);
    const pagination = {
      take: 101,
      orderBy: { id: 'asc' as const },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    };
    const examples: Array<{ id: string; eligible: boolean; reason: string }> = [];
    let hasMore = false;
    if (input.domain === 'LEAVE') {
      const rows = await tx.leaveRequest.findMany({
        ...pagination,
        where: {
          organizationId: context.organizationId,
          ...(input.ids ? { id: { in: input.ids } } : {}),
          status: 'PENDING',
          sourceAccessMode: 'NATIVE',
        },
        include: {
          approvals: true,
          leaveType: true,
          files: { where: { status: 'AVAILABLE', deletedAt: null } },
        },
      });
      hasMore = rows.length > 100;
      for (const request of rows.slice(0, 100)) {
        const worked = await tx.attendanceRecord.count({
          where: {
            organizationId: context.organizationId,
            employeeId: request.employeeId,
            workDate: { gte: request.startDate, lte: request.endDate },
            punches: { some: {} },
          },
        });
        const closed = await tx.payrollRun.count({
          where: {
            organizationId: context.organizationId,
            periodStart: { lte: request.endDate },
            periodEnd: { gte: request.startDate },
            status: { in: ['RELEASED', 'LOCKED', 'CORRECTED'] },
          },
        });
        const today = await approvalLocalDate(tx, context.organizationId, request.branchId);
        const eligible = automaticApproval(rule, {
          today,
          branchId: request.branchId,
          leaveTypeId: request.leaveTypeId,
          leaveDays: Number(request.requestedDays),
          noticeDays: Math.floor((request.startDate.getTime() - Date.parse(today)) / 86400000),
          requiresReview:
            request.approvals.length > 0 ||
            worked > 0 ||
            closed > 0 ||
            (request.leaveType.requiresAttachment && !request.files.length),
        });
        examples.push({
          id: request.id,
          eligible,
          reason: eligible
            ? 'Matches scope and limits; no exception found.'
            : 'Outside scope or limits, already reviewed, missing documents, worked attendance, or closed payroll.',
        });
      }
    } else {
      const rows = await tx.attendanceCorrection.findMany({
        ...pagination,
        where: {
          organizationId: context.organizationId,
          ...(input.ids ? { id: { in: input.ids } } : {}),
          status: 'PENDING',
          requestedByClientId: null,
        },
        include: { approvals: true, attendanceRecord: true },
      });
      hasMore = rows.length > 100;
      for (const request of rows.slice(0, 100)) {
        const closed = await tx.payrollRun.count({
          where: {
            organizationId: context.organizationId,
            periodStart: { lte: request.attendanceRecord.workDate },
            periodEnd: { gte: request.attendanceRecord.workDate },
            status: { in: ['RELEASED', 'LOCKED', 'CORRECTED'] },
          },
        });
        const eligible =
          !closed &&
          !request.approvals.length &&
          (await shouldAutoApproveCorrection(
            tx,
            context.organizationId,
            request.attendanceRecordId,
            rule,
            request.afterSnapshot,
            new Date(),
            request.id,
          ));
        examples.push({
          id: request.id,
          eligible,
          reason: eligible
            ? 'Matches scope, working calendar and correction limits.'
            : 'Requires review: limits, incomplete punches, non-working day, overtime, closed payroll, or prior review.',
        });
      }
    }
    return {
      processed: examples.length,
      eligible: examples.filter((row) => row.eligible).length,
      manual: examples.filter((row) => !row.eligible).length,
      nextCursor: hasMore ? examples.at(-1)!.id : null,
      examples,
    };
  }
}
