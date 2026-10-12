import { listLeaveRequests, type LeaveListFilters } from './leave-request-list';
import { validateLeaveSession } from './leave-units';
import { Injectable } from '@nestjs/common';
import { formatDateRange } from '@smarteam/contracts';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { Prisma } from '../../generated/prisma/client';
import type { AccessMode } from '../../generated/prisma/enums';
import { LeaveBalanceTransactionType, LeaveRequestStatus } from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import {
  assertResolvableApprovers,
  canApprove,
  type ApprovalAuthorizationCache,
} from '../approvals/approval-authorization';
import { systemApprovalContext } from '../approvals/approval-automation';
import { approvalInboxPage, type InboxPagination } from '../approvals/approval-inbox-page';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { resolveActingEmployeeId } from '../employees/employee-scope';
import { OutboxService } from '../federation/outbox.service';
import { describeDays, notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { shouldAutoApproveLeave } from './leave-automation';
import { leaveCalendarDays, ledger, provisionBalance } from './leave-balance-ops';
import { LeaveDecisionsService } from './leave-decisions.service';
import { dateOnly, employeeScope, leavePeriod, toRequestDto } from './leave-shared';

/**
 * Raising leave requests, and the two lists that show them.
 *
 * Creating a request is the heavy path: it validates the dates against the calendar, reserves
 * against the balance, resolves the approval chain and publishes to the outbox. Deciding on one
 * afterwards is a different concern and lives in `LeaveDecisionsService`.
 */
/** What a caller supplies to raise a leave request. Exported so the controller can name it. */
export type LeaveRequestInput = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  branchId?: string;
  externalId?: string;
  attachmentIds?: string[];
  session?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
  source: AccessMode;
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  listRequests(
    context: DomainContext,
    requestedEmployeeId?: string,
    pagination: LeaveListFilters = {},
  ) {
    return listLeaveRequests(this.database, context, requestedEmployeeId, pagination);
  }

  /** Tenant-scoped aggregates for the leave overview cards (never derived from the current page). */
  async adminSummary(context: DomainContext) {
    requirePermission(context, 'leave.requests.read.all');
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    return this.database.run(context, async (tx) => {
      const base = {
        organizationId: context.organizationId,
        ...(context.branchId ? { branchId: context.branchId } : {}),
      };
      const [pending, approvedThisMonth, onLeaveToday, requestedDays] = await Promise.all([
        tx.leaveRequest.count({ where: { ...base, status: LeaveRequestStatus.PENDING } }),
        tx.leaveRequest.count({
          where: { ...base, status: LeaveRequestStatus.APPROVED, startDate: { lt: nextMonth }, endDate: { gte: monthStart } },
        }),
        tx.leaveRequest.groupBy({
          by: ['employeeId'],
          where: {
            ...base,
            status: LeaveRequestStatus.APPROVED,
            startDate: { lt: tomorrow },
            endDate: { gte: todayStart },
          },
        }),
        tx.leaveRequest.aggregate({
          where: {
            ...base,
            status: LeaveRequestStatus.APPROVED,
            startDate: { lt: nextMonth },
            endDate: { gte: monthStart },
          },
          _sum: { requestedDays: true },
        }),
      ]);
      return {
        pending,
        approvedThisMonth,
        employeesOnLeaveToday: onLeaveToday.length,
        approvedDaysTouchingMonth: Number(requestedDays._sum.requestedDays ?? 0),
        month: monthStart.toISOString().slice(0, 7),
        asOf: todayStart.toISOString().slice(0, 10),
      };
    });
  }

  async listPendingApprovals(
    context: DomainContext,
    approverUserId: string,
    pagination?: InboxPagination,
  ) {
    requirePermission(context, 'leave.requests.read');
    return this.database.run(
      context,
      async (tx) => {
        const authorizationCache: ApprovalAuthorizationCache = new Map();
        const page = await approvalInboxPage(
          (cursor, take) =>
            tx.leaveRequest.findMany({
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              where: {
                organizationId: context.organizationId,
                status: LeaveRequestStatus.PENDING,
                ...(context.branchId ? { branchId: context.branchId } : {}),
              },
              include: {
                files: {
                  where: { status: 'AVAILABLE', deletedAt: null },
                  select: { id: true, originalName: true, contentType: true, byteSize: true },
                },
                leaveType: { select: { id: true, code: true, name: true, paid: true } },
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
                branch: { select: { id: true, code: true, name: true } },
                approvals: true,
                approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
              },
              orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
              take,
            }),
          async (request) => {
            const pendingStep = request.approvalPolicy?.steps.find(
              (step) =>
                !request.approvals.some((approval) => approval.stepNumber === step.stepNumber),
            );
            if (!pendingStep) return false;
            return await canApprove(
              tx,
              context.organizationId,
              approverUserId,
              request.employee.manager?.userId,
              pendingStep.approverType,
              pendingStep.roleId,
              pendingStep.approverUserId,
              request.branchId ?? context.branchId,
              request.employee.userId,
              authorizationCache,
            );
          },
          pagination,
        );
        const items = [];
        for (const request of page.items) {
          const pendingStep = request.approvalPolicy!.steps.find(
            (step) =>
              !request.approvals.some((approval) => approval.stepNumber === step.stepNumber),
          )!;
          const holidaysInRange = await tx.holiday.findMany({
            where: {
              organizationId: context.organizationId,
              holidayDate: { gte: request.startDate, lte: request.endDate },
            },
            select: { name: true },
          });
          const warningReason =
            holidaysInRange.length > 0
              ? `Includes holiday: ${holidaysInRange.map((h) => h.name).join(', ')}`
              : null;

          items.push({
            ...toRequestDto(request),
            externalEmployeeId: request.employee.externalId,
            warningReason,
            employee: {
              id: request.employee.id,
              externalId: request.employee.externalId,
              employeeNumber: request.employee.employeeNumber,
              firstName: request.employee.firstName,
              lastName: request.employee.lastName,
            },
            branch: request.branch,
            leaveType: request.leaveType,
            reason: request.reason,
            submittedAt: request.submittedAt,
            attachments: request.files.map((file) => ({
              id: file.id,
              name: file.originalName,
              contentType: file.contentType,
              byteSize: file.byteSize.toString(),
            })),
            currentStep: {
              stepNumber: pendingStep.stepNumber,
              approverType: pendingStep.approverType,
              roleId: pendingStep.roleId,
              approverUserId: pendingStep.approverUserId,
            },
          });
        }
        return { requests: items, nextCursor: page.nextCursor };
      },
      { timeout: 30000 },
    );
  }

  async createRequest(context: DomainContext, input: LeaveRequestInput) {
    requirePermission(context, 'leave.requests.write');
    return this.database.run(context, async (tx) => {
      const start = dateOnly(input.startDate);
      const end = dateOnly(input.endDate);
      if (end < start) throw new ConflictError('Leave end date must not precede start date');
      const units = validateLeaveSession(input.session, start, end);
      // `leave.requests.write` is a self-service permission, so the employee a request is booked
      // against comes from the session unless the caller can see everyone's leave.
      const employeeId = await resolveActingEmployeeId(
        tx,
        context,
        input.employeeId,
        'leave.requests.read.all',
      );
      const [employee, type, settings] = await Promise.all([
        tx.employee.findFirst({
          where: {
            id: employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...(context.branchId ? employeeScope(context) : {}),
          },
          include: { manager: { select: { userId: true } } },
        }),
        tx.leaveType.findFirst({
          where: { id: input.leaveTypeId, organizationId: context.organizationId, isActive: true },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
      ]);
      if (!employee) throw new NotFoundError('Active employee');
      if (!type) throw new NotFoundError('Leave type');
      if (
        input.source === 'NATIVE' &&
        end > leavePeriod(start, settings.leaveYearStartMonth).periodEnd
      )
        throw new ConflictError(
          'Split this request at the end of the leave year; each year uses its own balance.',
        );
      // One day cannot be taken off twice: a request touching a day already asked for or
      // granted is refused, whichever type it was. Native requests only; what federation
      // partners may send is a frozen contract.
      // Held until the transaction ends, so two requests sent at once are checked one after the
      // other rather than both passing the lookup below.
      if (input.source === 'NATIVE')
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`leave:${employee.id}`}, 0))`;
      const clash =
        input.source === 'NATIVE' &&
        (await tx.leaveRequest.findFirst({
          where: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
          select: { startDate: true, endDate: true, status: true },
        }));
      if (clash)
        throw new ConflictError(
          `Your leave for ${formatDateRange(clash.startDate, clash.endDate)} is already ` +
            `${clash.status.toLowerCase()} and covers some of these days.`,
        );
      const branchId = context.branchId ?? input.branchId ?? employee.primaryBranchId;
      if (!branchId) throw new ConflictError('An employee branch is required for leave requests');
      if (
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      if (input.source === 'NATIVE')
        await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${context.organizationId}::uuid AND period_start <= ${end} AND period_end >= ${start} FOR UPDATE`;
      const calendar = await leaveCalendarDays(
        tx,
        context.organizationId,
        branchId,
        start,
        end,
        settings.workWeekDays,
        employee.id,
        type.sandwichOffDays,
      );
      const chargedDates = calendar.filter((day) => day.counted).map((day) => day.date);
      if (
        input.source === 'NATIVE' &&
        (calendar[0]?.reason !== 'Working day' ||
          calendar[calendar.length - 1]?.reason !== 'Working day')
      )
        throw new ConflictError(
          'Start and end dates must be working days, excluding holidays and weekly days off.',
        );
      const days = chargedDates.length * units;
      if (days <= 0) throw new ConflictError('Leave request must contain at least one working day');
      if (type.requiresAttachment && !input.attachmentIds?.length)
        throw new ConflictError('This leave type requires supporting attachment');
      if (input.attachmentIds?.length) {
        const count = await tx.fileObject.count({
          where: {
            id: { in: input.attachmentIds },
            organizationId: context.organizationId,
            employeeId: employee.id,
            purpose: 'LEAVE_ATTACHMENT',
            status: 'AVAILABLE',
            deletedAt: null,
            leaveRequestId: null,
          },
        });
        if (count !== input.attachmentIds.length)
          throw new ConflictError('Every leave attachment must be an available tenant file');
      }
      const assignment = await tx.leavePolicyAssignment.findFirst({
        where: { organizationId: context.organizationId, branchId, leaveTypeId: type.id },
      });
      if (!assignment)
        throw new ConflictError('This leave policy is not assigned to the employee branch');
      await provisionBalance(tx, context, employee.id, type, settings.leaveYearStartMonth, start);
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_periodStart_periodEnd: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            ...leavePeriod(start, settings.leaveYearStartMonth),
          },
        },
      });
      if (!balance) throw new NotFoundError('Leave balance');
      const available = Number(balance.availableAmount);
      if (available < days)
        // A partner integration matches on the original wording, so only the app says more.
        throw new ConflictError(
          input.source === 'NATIVE'
            ? `This needs ${days} ${days === 1 ? 'day' : 'days'} of ${type.name}; ` +
                `${available} ${available === 1 ? 'is' : 'are'} available.`
            : 'Leave balance is insufficient',
        );
      const activePolicies = await tx.approvalPolicy.findMany({
        where: {
          organizationId: context.organizationId,
          domain: 'LEAVE',
          isActive: true,
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      const policy =
        activePolicies.find((candidate) => candidate.isDefault) ??
        (activePolicies.length === 1 ? activePolicies[0] : undefined);
      if (!policy)
        throw new ConflictError(
          'Configure a default leave approval policy before submitting leave requests',
        );
      const automaticallyApproved = await shouldAutoApproveLeave(tx, context.organizationId, {
        source: input.source,
        branchId,
        employeeId: employee.id,
        leaveTypeId: type.id,
        start,
        end,
        days,
        automation: policy.automation,
      });
      if (!automaticallyApproved)
        await assertResolvableApprovers(
          tx,
          context.organizationId,
          branchId,
          employee.manager?.userId,
          employee.userId,
          policy.steps,
        );
      const request = await tx.leaveRequest.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          branchId,
          leaveTypeId: type.id,
          approvalPolicyId: policy.id,
          startDate: start,
          endDate: end,
          requestedDays: new Prisma.Decimal(days),
          session: input.session ?? 'FULL_DAY',
          ...(input.source === 'NATIVE' ? { chargedDates } : {}),
          reason: input.reason,
          status: LeaveRequestStatus.PENDING,
          sourceAccessMode: input.source,
          externalId: input.externalId,
          submittedAt: new Date(),
        },
      });
      if (input.attachmentIds?.length) {
        const attached = await tx.fileObject.updateMany({
          where: {
            id: { in: input.attachmentIds },
            organizationId: context.organizationId,
            employeeId: employee.id,
            purpose: 'LEAVE_ATTACHMENT',
            status: 'AVAILABLE',
            deletedAt: null,
            leaveRequestId: null,
          },
          data: { leaveRequestId: request.id },
        });
        if (attached.count !== input.attachmentIds.length)
          throw new ConflictError(
            'An attachment was already used. Upload a separate copy for this request.',
          );
      }
      const reserved = await tx.leaveBalance.updateMany({
        where: { id: balance.id, availableAmount: { gte: days } },
        data: {
          reservedAmount: { increment: days },
          availableAmount: { decrement: days },
          version: { increment: 1 },
        },
      });
      if (reserved.count !== 1) throw new ConflictError('Leave balance is insufficient');
      await ledger(tx, context, balance.id, {
        transactionType: LeaveBalanceTransactionType.RESERVATION,
        amount: new Prisma.Decimal(days),
        reason: `Reserved for leave request ${request.id}`,
        leaveRequestId: request.id,
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_REQUEST',
          entityId: request.id,
          action: 'LEAVE_REQUEST_SUBMITTED',
          afterState: jsonSnapshot(request),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'LeaveRequest',
          aggregateId: request.id,
          aggregateVersion: request.version,
          eventType: 'leave.request.submitted',
          payload: jsonSnapshot(toRequestDto(request, days)),
        },
        tx,
      );
      if (automaticallyApproved)
        return new LeaveDecisionsService(this.database, this.audit).decideInTransaction(
          tx,
          systemApprovalContext(context),
          request.id,
          'APPROVED',
          `Automatically approved — ${policy.name} (${policy.id})`,
        );
      // Whoever can decide the first step hears about it now.
      const firstStep = policy.steps[0];
      if (firstStep) {
        const requester = await requesterRouting(tx, context.organizationId, employee.id);
        await notify(tx, context, {
          recipients: await stepApprovers(
            tx,
            context.organizationId,
            firstStep,
            requester,
            branchId,
          ),
          kind: 'LEAVE_PENDING',
          title: 'Leave request awaiting your decision',
          body: `${requester.name} asked for ${type.name} on ${describeDays(start, end)} (${days} day${days === 1 ? '' : 's'}).`,
          module: 'approvals',
          entityType: 'LEAVE_REQUEST',
          entityId: request.id,
        });
      }
      return toRequestDto(request, days);
    });
  }
}
