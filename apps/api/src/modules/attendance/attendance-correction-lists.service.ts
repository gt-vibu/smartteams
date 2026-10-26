import { employeeNameSearch } from '../employees/employee-name-search';
import { findSelfEmployeeId } from '../employees/employee-access';
import { ConflictError } from '../../common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { canApprove, type ApprovalAuthorizationCache } from '../approvals/approval-authorization';
import { approvalInboxPage, type InboxPagination } from '../approvals/approval-inbox-page';
import { canReadAllEmployees, toPunchDto } from './attendance-shared';

/**
 * The two views over correction requests: what is waiting for me to approve, and what I have
 * raised.
 *
 * Read-only, and self-scoped the same way the rest of the module is.
 */
@Injectable()
export class AttendanceCorrectionListsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listPendingCorrectionApprovals(
    context: DomainContext,
    approverUserId: string,
    pagination?: InboxPagination,
  ) {
    requirePermission(context, 'attendance.read');
    return this.database.run(
      context,
      async (tx) => {
        const authorizationCache: ApprovalAuthorizationCache = new Map();
        const page = await approvalInboxPage(
          (cursor, take) =>
            tx.attendanceCorrection.findMany({
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take,
            }),
          async (correction) => {
            const pendingStep = correction.approvalPolicy?.steps.find(
              (step) =>
                !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
            );
            if (!pendingStep) return false;
            return await canApprove(
              tx,
              context.organizationId,
              approverUserId,
              correction.attendanceRecord.employee.manager?.userId,
              pendingStep.approverType,
              pendingStep.roleId,
              pendingStep.approverUserId,
              correction.attendanceRecord.branchId ?? context.branchId,
              correction.attendanceRecord.employee.userId,
              authorizationCache,
            );
          },
          pagination,
        );
        const items = [];
        for (const correction of page.items) {
          const pendingStep = correction.approvalPolicy!.steps.find(
            (step) =>
              !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
          )!;
          const snapshot =
            typeof correction.afterSnapshot === 'object' && correction.afterSnapshot !== null
              ? (correction.afterSnapshot as Record<string, unknown>)
              : null;
          const warningReason = snapshot?.isNonWorkingDay
            ? (snapshot.nonWorkingDayDetail as string) ||
              (snapshot.nonWorkingDayReason as string) ||
              'Non-working day'
            : null;

          items.push({
            id: correction.id,
            attendanceId: correction.attendanceRecord.id,
            status: correction.status,
            reason: correction.reason,
            warningReason,
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
        return { corrections: items, nextCursor: page.nextCursor };
      },
      { timeout: 30000 },
    );
  }

  async listCorrectionRequests(
    context: DomainContext,
    filters: {
      employeeId?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
      limit?: number;
      cursor?: string;
      search?: string;
    },
  ) {
    requirePermission(context, 'attendance.read');
    return this.database.run(context, async (tx) => {
      const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
      let employeeId = filters.employeeId;
      if (!canReadAllEmployees(context, 'attendance.read.all')) {
        const self = await findSelfEmployeeId(tx, context);
        if (!self) return { corrections: [], nextCursor: undefined };
        if (employeeId && employeeId !== self) throw new ConflictError('Employees may only read their own attendance corrections');
        employeeId = self;
      }
      const corrections = await tx.attendanceCorrection.findMany({
        where: {
          organizationId: context.organizationId,
          ...(filters.status ? { status: filters.status } : {}),
          attendanceRecord: {
            ...(context.branchId ? { branchId: context.branchId } : {}),
            ...(employeeId ? { employeeId } : {}),
            ...(filters.search ? { employee: employeeNameSearch(filters.search) } : {}),
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
        take: limit + 1,
      });
      return {
        nextCursor: corrections.length > limit ? corrections[limit - 1]?.id : undefined,
        corrections: corrections.slice(0, limit).map((correction) => ({
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
