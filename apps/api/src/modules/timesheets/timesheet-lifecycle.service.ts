import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { AccessMode, TimesheetStatus } from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { assertApprover, assertResolvableApprovers } from '../approvals/approval-authorization';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { assertMayActForEmployee } from '../employees/employee-scope';
import { OutboxService } from '../federation/outbox.service';
import { describeDays, notify, requesterRouting, stepApprovers } from '../notifications/notify';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { WorkingDayService } from '../shifts/working-day.service';

/**
 * A timesheet's approval cycle: submit, recall, and the approver's decision.
 *
 * Separate from `TimesheetEntriesService`, which records the time itself. The two share no state;
 * this half is the one that hands hours to payroll, so it is the half that enforces who may decide.
 */
@Injectable()
export class TimesheetLifecycleService {
  private readonly workingDays: WorkingDayService;

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {
    this.workingDays = new WorkingDayService(database);
  }

  async unsubmit(context: DomainContext, timesheetId: string) {
    requirePermission(context, 'timesheets.write');
    return this.database.run(context, async (tx) => {
      const timesheet = await tx.timesheet.findFirst({
        where: {
          id: timesheetId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (!timesheet || timesheet.status !== TimesheetStatus.SUBMITTED)
        throw new ConflictError('Only a submitted timesheet can be recalled');
      // Recalling someone else's submission is the same power as submitting it.
      await assertMayActForEmployee(tx, context, timesheet.employeeId, 'timesheets.read.all');
      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: TimesheetStatus.DRAFT,
          submittedAt: null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
          action: 'TIMESHEET_RECALLED',
          beforeState: jsonSnapshot(timesheet),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async submit(context: DomainContext, timesheetId: string) {
    requirePermission(context, 'timesheets.submit');
    return this.database.run(context, async (tx) => {
      const timesheet = await tx.timesheet.findFirst({
        where: {
          id: timesheetId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (!timesheet || timesheet.status !== TimesheetStatus.DRAFT)
        throw new ConflictError('Only a draft timesheet can be submitted');
      // A timesheet is reached by its own id, so ownership is read off the row. `timesheets.submit`
      // is a self-service permission; without this an employee could submit a colleague's sheet.
      await assertMayActForEmployee(tx, context, timesheet.employeeId, 'timesheets.read.all');
      const employeeForPolicy = await tx.employee.findFirst({
        where: { id: timesheet.employeeId, organizationId: context.organizationId },
        select: { userId: true, manager: { select: { userId: true } } },
      });
      if (timesheet.totalMinutes <= 0)
        throw new ConflictError(
          'Cannot submit an empty timesheet. Please log your work hours before submitting.',
        );
      // Re-read under a row lock: without it two concurrent submissions both see DRAFT, both pass
      // the guard above, and the sheet is submitted twice — same row, but two audit events and two
      // version increments describing one submission.
      await tx.$queryRaw`SELECT id FROM timesheets WHERE id = ${timesheet.id}::uuid FOR UPDATE`;
      const locked = await tx.timesheet.findUnique({
        where: { id: timesheet.id },
        select: { status: true },
      });
      if (locked?.status !== TimesheetStatus.DRAFT)
        throw new ConflictError('Only a draft timesheet can be submitted');
      // A submission with no approval policy used to be accepted, storing a null policy id — the
      // sheet then had no steps, so `decide` found no pending step, skipped approver checks, and
      // anyone holding `timesheets.decide` could approve it. Leave and attendance corrections both
      // refuse in this situation; timesheets now do the same, resolved the same way: the default
      // policy, or the only active one.
      const activePolicies = await tx.approvalPolicy.findMany({
        where: { organizationId: context.organizationId, domain: 'TIMESHEET', isActive: true },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      const policy =
        activePolicies.find((candidate) => candidate.isDefault) ??
        (activePolicies.length === 1 ? activePolicies[0] : undefined);
      if (!policy || policy.steps.length === 0)
        throw new ConflictError(
          'Configure a default timesheet approval policy before submitting timesheets',
        );
      // A policy whose approvers cannot be resolved would strand the sheet in SUBMITTED with
      // nobody able to act on it, so it is refused at submission rather than discovered later.
      // Role-scoped approval steps are resolved within a branch, so one is required — the same
      // requirement leave requests make.
      const approvalBranchId = timesheet.branchId ?? context.branchId;
      if (!approvalBranchId)
        throw new ConflictError('An employee branch is required to route timesheet approval');
      await assertResolvableApprovers(
        tx,
        context.organizationId,
        approvalBranchId,
        employeeForPolicy?.manager?.userId,
        employeeForPolicy?.userId,
        policy.steps,
      );
      const period = await tx.timesheetPeriod.findUnique({
        where: { id: timesheet.timesheetPeriodId },
        select: { periodStart: true, periodEnd: true },
      });
      const expectedInfo = period
        ? await this.workingDays.expectedHours(
            tx,
            context.organizationId,
            timesheet.employeeId,
            period.periodStart,
            period.periodEnd,
          )
        : null;
      const isUnderLogged = expectedInfo
        ? timesheet.totalMinutes < expectedInfo.totalMinutes
        : false;

      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: TimesheetStatus.SUBMITTED,
          submittedAt: new Date(),
          approvalPolicyId: policy.id,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
          action: 'TIMESHEET_SUBMITTED',
          beforeState: jsonSnapshot(timesheet),
          afterState: jsonSnapshot({
            ...updated,
            expectedMinutes: expectedInfo?.totalMinutes,
            isUnderLogged,
          }),
        },
        tx,
      );
      const requester = await requesterRouting(tx, context.organizationId, timesheet.employeeId);
      const firstStep = policy.steps[0];
      if (firstStep)
        await notify(tx, context, {
          recipients: await stepApprovers(
            tx,
            context.organizationId,
            firstStep,
            requester,
            approvalBranchId,
          ),
          kind: 'TIMESHEET_PENDING',
          title: 'Timesheet awaiting your approval',
          body: `${requester.name} submitted their timesheet for ${periodLabel(await periodOf(tx, timesheet.timesheetPeriodId))}.`,
          module: 'approvals',
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
        });
      return updated;
    });
  }

  async decide(
    context: DomainContext,
    timesheetId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string | null,
  ) {
    requirePermission(context, 'timesheets.decide');
    if (status === 'REJECTED') {
      requireReason(
        { ...context, reason: comment ?? undefined },
        'Timesheet rejections require a comment',
      );
    }
    const approverUserId = context.actor.userId;
    if (!approverUserId) throw new ConflictError('A human approver is required');
    return this.database.run(context, async (tx) => {
      const timesheet = await tx.timesheet.findFirst({
        where: {
          id: timesheetId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: {
          approvals: true,
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
          employee: { include: { manager: { select: { userId: true } } } },
        },
      });
      if (!timesheet || timesheet.status !== TimesheetStatus.SUBMITTED)
        throw new ConflictError('Timesheet is not awaiting approval');
      // Nobody approves their own hours. Leave and attendance corrections already pass the
      // requester to `assertApprover`; timesheets did not, so a manager, or a named approver, who
      // logged time could approve their own sheet — and approved sheets are what payroll pays.
      //
      // Native sessions only. A federated decision names its approver through the partner's own
      // workflow, and the Federation contract is frozen: applying the rule there would refuse
      // requests partners send today. Whether federated timesheets should match federated leave,
      // which does refuse it, is for that contract to decide.
      const requesterUserId =
        context.accessMode === AccessMode.FEDERATION ? undefined : timesheet.employee.userId;
      if (requesterUserId && requesterUserId === approverUserId)
        throw new ForbiddenDomainError('You cannot approve your own timesheet');
      // Submission now guarantees a policy, but a sheet submitted before that rule existed, or one
      // whose policy was deactivated afterwards, would otherwise reach the fallback below and be
      // decided with no approver check at all.
      if (!timesheet.approvalPolicy || timesheet.approvalPolicy.steps.length === 0)
        throw new ConflictError(
          'This timesheet has no approval policy; configure one and resubmit it',
        );
      const pendingStep = timesheet.approvalPolicy.steps.find(
        (step) =>
          !timesheet.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
      );
      if (pendingStep)
        await assertApprover(
          tx,
          context.organizationId,
          approverUserId,
          timesheet.employee.manager?.userId,
          pendingStep.approverType,
          pendingStep.roleId,
          pendingStep.approverUserId,
          timesheet.branchId ?? context.branchId,
          requesterUserId,
        );
      const stepNumber = pendingStep?.stepNumber ?? 1;
      const hasMoreSteps = Boolean(
        timesheet.approvalPolicy.steps.some((step) => step.stepNumber > stepNumber),
      );
      // Payroll consumes approved timesheets only, so a decision either adds hours to a
      // calculated run or takes them away. Either way the run is no longer current.
      const period = await tx.timesheetPeriod.findUnique({
        where: { id: timesheet.timesheetPeriodId },
        select: { periodStart: true, periodEnd: true },
      });
      if (period && !hasMoreSteps)
        await markPayrollStale(tx, context.organizationId, period.periodStart, period.periodEnd);
      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: status === 'REJECTED' || !hasMoreSteps ? status : TimesheetStatus.SUBMITTED,
          approvedAt: status === TimesheetStatus.APPROVED && !hasMoreSteps ? new Date() : undefined,
          version: { increment: 1 },
          approvals: {
            create: {
              organizationId: context.organizationId,
              approverUserId,
              approvalPolicyStepId: pendingStep?.id,
              status,
              comment: comment ?? null,
            },
          },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
          action: `TIMESHEET_${status}`,
          beforeState: jsonSnapshot(timesheet),
          afterState: jsonSnapshot(updated),
          reason: comment ?? '',
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Timesheet',
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          eventType: 'timesheet.status.changed',
          payload: jsonSnapshot(updated),
        },
        tx,
      );
      const requester = await requesterRouting(tx, context.organizationId, timesheet.employeeId);
      const which = periodLabel(period);
      if (hasMoreSteps && status !== 'REJECTED') {
        const next = timesheet.approvalPolicy.steps.find((step) => step.stepNumber > stepNumber);
        if (next)
          await notify(tx, context, {
            recipients: await stepApprovers(
              tx,
              context.organizationId,
              next,
              requester,
              timesheet.branchId ?? context.branchId,
            ),
            kind: 'TIMESHEET_PENDING',
            title: 'Timesheet awaiting your approval',
            body: `${requester.name}'s timesheet for ${which} passed the previous approval step.`,
            module: 'approvals',
            entityType: 'TIMESHEET',
            entityId: timesheet.id,
          });
      } else {
        const approved = status === TimesheetStatus.APPROVED;
        await notify(tx, context, {
          recipients: [requester.userId],
          kind: 'TIMESHEET_DECIDED',
          title: approved ? 'Timesheet approved' : 'Timesheet returned',
          body: approved
            ? `Your timesheet for ${which} was approved.`
            : `Your timesheet for ${which} was rejected: ${comment}`,
          module: 'timesheet',
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
        });
      }
      return updated;
    });
  }
}

async function periodOf(tx: Prisma.TransactionClient, periodId: string) {
  return tx.timesheetPeriod.findUnique({
    where: { id: periodId },
    select: { periodStart: true, periodEnd: true },
  });
}

/** "1 – 30 Sept 2026", or "this period" if the period is gone. */
function periodLabel(period: { periodStart: Date; periodEnd: Date } | null) {
  return period ? describeDays(period.periodStart, period.periodEnd) : 'this period';
}
