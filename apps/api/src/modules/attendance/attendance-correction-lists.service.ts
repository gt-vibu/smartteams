import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { canApprove } from '../approvals/approval-authorization';
import { toPunchDto } from './attendance-shared';

/**
 * The two views over correction requests: what is waiting for me to approve, and what I have
 * raised.
 *
 * Read-only, and self-scoped the same way the rest of the module is.
 */
@Injectable()
export class AttendanceCorrectionListsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listPendingCorrectionApprovals(context: DomainContext, approverUserId: string) {
    requirePermission(context, 'attendance.read');
    return this.database.run(context, async (tx) => {
      const corrections = await tx.attendanceCorrection.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'PENDING',
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
          approvals: true,
          attendanceRecord: {
            select: {
              id: true,
              workDate: true,
              branchId: true,
              employee: {
                select: {
                  id: true,
                  externalId: true,
                  employeeNumber: true,
                  firstName: true,
                  lastName: true,
                  userId: true,
                  manager: { select: { userId: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      const items = [];
      for (const correction of corrections) {
        const pendingStep = correction.approvalPolicy?.steps.find(
          (step) =>
            !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
        );
        if (
          !pendingStep ||
          !(await canApprove(
            tx,
            context.organizationId,
            approverUserId,
            correction.attendanceRecord.employee.manager?.userId,
            pendingStep.approverType,
            pendingStep.roleId,
            pendingStep.approverUserId,
            correction.attendanceRecord.branchId ?? context.branchId,
            correction.attendanceRecord.employee.userId,
          ))
        )
          continue;
        items.push({
          id: correction.id,
          attendanceId: correction.attendanceRecord.id,
          status: correction.status,
          reason: correction.reason,
          beforeSnapshot: correction.beforeSnapshot,
          afterSnapshot: correction.afterSnapshot,
          createdAt: correction.createdAt,
          workDate: correction.attendanceRecord.workDate,
          branchId: correction.attendanceRecord.branchId,
          externalEmployeeId: correction.attendanceRecord.employee.externalId,
          employee: correction.attendanceRecord.employee,
          currentStep: {
            stepNumber: pendingStep.stepNumber,
            approverType: pendingStep.approverType,
            roleId: pendingStep.roleId,
            approverUserId: pendingStep.approverUserId,
          },
        });
      }
      return { corrections: items };
    });
  }

  async listCorrectionRequests(
    context: DomainContext,
    filters: {
      employeeId?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
      limit?: number;
    },
  ) {
    requirePermission(context, 'attendance.read');
    return this.database.run(context, async (tx) => {
      const corrections = await tx.attendanceCorrection.findMany({
        where: {
          organizationId: context.organizationId,
          ...(filters.status ? { status: filters.status } : {}),
          attendanceRecord: {
            ...(context.branchId ? { branchId: context.branchId } : {}),
            ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
          },
        },
        include: {
          approvals: { orderBy: { stepNumber: 'asc' } },
          attendanceRecord: {
            include: {
              punches: { orderBy: { occurredAt: 'asc' } },
              employee: {
                select: {
                  id: true,
                  externalId: true,
                  employeeNumber: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit ?? 200, 500),
      });
      return {
        corrections: corrections.map((correction) => ({
          id: correction.id,
          attendanceId: correction.attendanceRecordId,
          status: correction.status,
          reason: correction.reason,
          beforeSnapshot: correction.beforeSnapshot,
          afterSnapshot: correction.afterSnapshot,
          createdAt: correction.createdAt,
          workDate: correction.attendanceRecord.workDate,
          branchId: correction.attendanceRecord.branchId,
          externalEmployeeId: correction.attendanceRecord.employee.externalId,
          employee: correction.attendanceRecord.employee,
          approvals: correction.approvals.map((approval) => ({
            status: approval.status,
            stepNumber: approval.stepNumber,
            comment: approval.comment,
            createdAt: approval.createdAt,
          })),
          effectiveAttendance: {
            status: correction.attendanceRecord.status,
            dayStatus: correction.attendanceRecord.dayStatus,
            workedMinutes: correction.attendanceRecord.workedMinutes,
            overtimeMinutes: correction.attendanceRecord.overtimeMinutes,
            punches: correction.attendanceRecord.punches.map((punch) => toPunchDto(punch)),
          },
        })),
      };
    });
  }
}
