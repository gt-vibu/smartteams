import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { resolveActingEmployeeId } from '../employees/employee-scope';
import { assertResolvableApprovers } from '../approvals/approval-authorization';
import { leaveCalendarDays } from './leave-balance-ops';
import { employeeScope, leavePeriod } from './leave-shared';
import { previewLeaveAvailable } from './leave-preview-balance';

const MAX_RANGE_DAYS = 1462;

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ConflictError('Enter valid calendar dates.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ConflictError('Enter valid calendar dates.');
  return date;
}

@Injectable()
export class LeavePreviewService {
  constructor(private readonly database: TenantDatabaseService) {}

  /** Calculate the employee's request without reserving balance or writing any records. */
  requestPreview(
    context: DomainContext,
    input: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      session?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
      attachmentIds?: string[];
    },
  ) {
    requirePermission(context, 'leave.requests.write');
    const start = parseDate(input.startDate);
    const end = parseDate(input.endDate);
    if (end < start) throw new ConflictError('Leave end date must not precede start date');
    const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (rangeDays > MAX_RANGE_DAYS)
      throw new ConflictError('Choose a valid calendar range within four years.');
    const session = input.session ?? 'FULL_DAY';
    if (session !== 'FULL_DAY' && start.getTime() !== end.getTime())
      throw new ConflictError('A half-day request must use one working date');

    return this.database.run(context, async (tx) => {
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
          select: {
            id: true,
            primaryBranchId: true,
            dateOfJoining: true,
            userId: true,
            manager: { select: { userId: true } },
          },
        }),
        tx.leaveType.findFirst({
          where: { id: input.leaveTypeId, organizationId: context.organizationId, isActive: true },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
          select: { workWeekDays: true, leaveYearStartMonth: true },
        }),
      ]);
      if (!employee) throw new NotFoundError('Active employee');
      if (!type) throw new NotFoundError('Leave type');
      const branchId = context.branchId ?? employee.primaryBranchId;
      if (!branchId) throw new ConflictError('An employee branch is required for leave requests');

      const [dates, requests, assignment, policies] = await Promise.all([
        leaveCalendarDays(
          tx,
          context.organizationId,
          branchId,
          start,
          end,
          settings.workWeekDays,
          employee.id,
          type.sandwichOffDays,
        ),
        tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
          select: { startDate: true, endDate: true, session: true },
        }),
        tx.leavePolicyAssignment.findFirst({
          where: { organizationId: context.organizationId, branchId, leaveTypeId: type.id },
        }),
        tx.approvalPolicy.findMany({
          where: { organizationId: context.organizationId, domain: 'LEAVE', isActive: true },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        }),
      ]);
      const dateCollision = requests.some((existing) => {
        const overlaps = existing.startDate <= end && existing.endDate >= start;
        const sameDay =
          start.getTime() === end.getTime() &&
          existing.startDate.getTime() === existing.endDate.getTime() &&
          existing.startDate.getTime() === start.getTime();
        const oppositeHalfDays =
          sameDay &&
          session !== 'FULL_DAY' &&
          existing.session !== 'FULL_DAY' &&
          existing.session !== session;
        return overlaps && !oppositeHalfDays;
      });
      const countedDays = dates.filter((day) => day.counted).length;
      const requestedDays = session === 'FULL_DAY' ? countedDays : countedDays > 0 ? 0.5 : 0;
      const policy =
        policies.find((item) => item.isDefault) ?? (policies.length === 1 ? policies[0] : null);
      const period = leavePeriod(start, settings.leaveYearStartMonth);
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_periodStart_periodEnd: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            ...period,
          },
        },
      });
      const availableDays = await previewLeaveAvailable(
        tx,
        context.organizationId,
        employee.id,
        type,
        period,
        employee.dateOfJoining,
        balance,
      );
      const issues: string[] = [];
      if (requestedDays <= 0) issues.push('Leave request must contain at least one working day');
      if (dateCollision)
        issues.push('One or more selected dates already have pending or approved leave');
      if (!assignment) issues.push('This leave policy is not assigned to the employee branch');
      if (!policy)
        issues.push('Configure a default leave approval policy before submitting leave requests');
      if (policy && policy.steps.length > 0) {
        try {
          await assertResolvableApprovers(
            tx,
            context.organizationId,
            branchId,
            employee.manager?.userId,
            employee.userId,
            policy.steps,
          );
        } catch (error) {
          issues.push(error instanceof Error ? error.message : 'The approval chain is incomplete');
        }
      }
      if (availableDays < requestedDays)
        issues.push(
          `This needs ${requestedDays} ${requestedDays === 1 ? 'day' : 'days'} of ${type.name}; ${availableDays} ${availableDays === 1 ? 'is' : 'are'} available.`,
        );
      if (type.requiresAttachment && !input.attachmentIds?.length)
        issues.push('This leave type requires a supporting attachment');
      if (input.attachmentIds?.length) {
        const validAttachments = await tx.fileObject.count({
          where: {
            id: { in: input.attachmentIds },
            organizationId: context.organizationId,
            employeeId: employee.id,
            purpose: 'LEAVE_ATTACHMENT',
            status: 'AVAILABLE',
            deletedAt: null,
          },
        });
        if (validAttachments !== input.attachmentIds.length)
          issues.push('Every leave attachment must be an available tenant file');
      }

      return {
        requestedDays,
        availableDays,
        remainingDays: availableDays - requestedDays,
        dates: dates.map(({ date, counted, reason }) => ({
          date,
          counted,
          reason: reason === 'Working day' ? '' : reason,
        })),
        requiresAttachment: type.requiresAttachment,
        policyName: policy?.name ?? null,
        approvalSteps: policy?.steps.length ?? 0,
        automaticallyApproved: false,
        issues,
      };
    });
  }

  availability(context: DomainContext, fromValue: string, toValue: string) {
    requirePermission(context, 'leave.requests.write');
    const from = parseDate(fromValue);
    const to = parseDate(toValue);
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS)
      throw new ConflictError('Choose a valid calendar range within four years.');

    return this.database.run(context, async (tx) => {
      const [employee, settings] = await Promise.all([
        tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true, primaryBranchId: true },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
          select: { workWeekDays: true, leaveYearStartMonth: true },
        }),
      ]);
      if (!employee) throw new NotFoundError('Employee');

      const [calendar, requests] = await Promise.all([
        leaveCalendarDays(
          tx,
          context.organizationId,
          employee.primaryBranchId,
          from,
          to,
          settings.workWeekDays,
          employee.id,
        ),
        tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: { startDate: true, endDate: true },
        }),
      ]);

      return {
        leaveYearStartMonth: settings.leaveYearStartMonth,
        dates: calendar.map(({ date, reason }) => {
          const alreadyRequested = requests.some(
            (request) =>
              request.startDate.toISOString().slice(0, 10) <= date &&
              request.endDate.toISOString().slice(0, 10) >= date,
          );
          return {
            date,
            reason: alreadyRequested
              ? 'Already requested for leave'
              : reason === 'Working day'
                ? null
                : reason,
          };
        }),
      };
    });
  }
}
