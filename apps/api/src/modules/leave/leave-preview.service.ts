import { validateLeaveSession } from './leave-units';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { resolveActingEmployeeId } from '../employees/employee-scope';
import { shouldAutoApproveLeave } from './leave-automation';
import { leaveCalendarDays } from './leave-balance-ops';
import { previewLeaveAvailable } from './leave-preview-balance';
import type { LeaveRequestInput } from './leave-requests.service';
import { dateOnly, leavePeriod } from './leave-shared';

export class LeavePreviewService {
  constructor(private readonly database: TenantDatabaseService) {}

  availability(context: DomainContext, from: string, to: string) {
    requirePermission(context, 'leave.requests.write');
    const start = dateOnly(from),
      end = dateOnly(to);
    if (end < start || end.getTime() - start.getTime() > 1465 * 86400000)
      throw new ConflictError('Choose a valid calendar range within four years.');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveActingEmployeeId(
        tx,
        context,
        undefined,
        'leave.requests.read.all',
      );
      const [employee, settings, requests] = await Promise.all([
        tx.employee.findFirst({
          where: { id: employeeId, organizationId: context.organizationId, status: 'ACTIVE' },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
        tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
          select: { startDate: true, endDate: true },
        }),
      ]);
      if (!employee) throw new NotFoundError('Active employee');
      const branchId = context.branchId ?? employee.primaryBranchId;
      if (!branchId) throw new ConflictError('An employee branch is required for leave requests');
      const dates = await leaveCalendarDays(
        tx,
        context.organizationId,
        branchId,
        start,
        end,
        settings.workWeekDays,
        employeeId,
      );
      return {
        leaveYearStartMonth: settings.leaveYearStartMonth,
        dates: dates.map((day) => ({
          date: day.date,
          reason: requests.some(
            (request) =>
              day.date >= request.startDate.toISOString().slice(0, 10) &&
              day.date <= request.endDate.toISOString().slice(0, 10),
          )
            ? 'Already requested for leave'
            : !day.counted
              ? day.reason
              : null,
        })),
      };
    });
  }

  preview(context: DomainContext, input: Omit<LeaveRequestInput, 'source'>) {
    requirePermission(context, 'leave.requests.write');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveActingEmployeeId(
        tx,
        context,
        input.employeeId,
        'leave.requests.read.all',
      );
      const [employee, type, settings] = await Promise.all([
        tx.employee.findFirst({
          where: { id: employeeId, organizationId: context.organizationId, status: 'ACTIVE' },
        }),
        tx.leaveType.findFirst({
          where: { id: input.leaveTypeId, organizationId: context.organizationId, isActive: true },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
      ]);
      if (!employee || !type) throw new NotFoundError('Active employee or leave type');
      const start = dateOnly(input.startDate),
        end = dateOnly(input.endDate);
      if (end < start) throw new ConflictError('Leave end date must not precede start date');
      const units = validateLeaveSession(input.session, start, end);
      const period = leavePeriod(start, settings.leaveYearStartMonth);
      if (end > period.periodEnd)
        throw new ConflictError(
          `Split this request at ${period.periodEnd.toISOString().slice(0, 10)}; each leave year uses its own balance.`,
        );
      const branchId = context.branchId ?? input.branchId ?? employee.primaryBranchId;
      if (!branchId) throw new ConflictError('An employee branch is required for leave requests');
      const assignment = await tx.leavePolicyAssignment.findFirst({
        where: { organizationId: context.organizationId, branchId, leaveTypeId: type.id },
      });
      if (!assignment) throw new ConflictError('This leave type is not assigned to your branch');
      const dates = await leaveCalendarDays(
        tx,
        context.organizationId,
        branchId,
        start,
        end,
        settings.workWeekDays,
        employeeId,
        type.sandwichOffDays,
      );
      const requestedDays = dates.filter((day) => day.counted).length * units;
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_periodStart_periodEnd: {
            employeeId,
            leaveTypeId: type.id,
            ...period,
          },
        },
      });
      const availableDays = await previewLeaveAvailable(
        tx,
        context.organizationId,
        employeeId,
        type,
        period,
        employee.dateOfJoining,
        balance,
      );
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      const policy = await tx.approvalPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          domain: 'LEAVE',
          isActive: true,
          isDefault: true,
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      const issues: string[] = [];
      if (dates[0]?.reason !== 'Working day' || dates[dates.length - 1]?.reason !== 'Working day')
        issues.push(
          'Start and end dates must be working days, excluding holidays and weekly days off.',
        );
      if (!requestedDays) issues.push('Choose a range containing a working day.');
      if (requestedDays > availableDays)
        issues.push(`This request needs ${requestedDays} days; ${availableDays} are available.`);
      if (overlap) issues.push('An existing pending or approved request covers these dates.');
      if (!policy) issues.push('HR must configure a default leave approval workflow.');
      const automaticallyApproved =
        issues.length === 0 &&
        (await shouldAutoApproveLeave(tx, context.organizationId, {
          source: 'NATIVE',
          branchId,
          employeeId,
          leaveTypeId: type.id,
          start,
          end,
          days: requestedDays,
          automation: policy?.automation,
        }));
      return {
        requestedDays,
        availableDays,
        remainingDays: availableDays - requestedDays,
        dates,
        requiresAttachment: type.requiresAttachment,
        policyName: policy?.name ?? null,
        approvalSteps: policy?.steps.length ?? 0,
        automaticallyApproved,
        issues,
      };
    });
  }
}
