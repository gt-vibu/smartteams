import { Injectable } from '@nestjs/common';
import { TimesheetEntrySource, TimesheetStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { OutboxService } from '../federation/outbox.service';
import { assertApprover } from '../approvals/approval-authorization';

import { dateOnly } from './timesheet-shared';

@Injectable()
export class TimesheetEntriesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async addManualEntry(
    context: DomainContext,
    timesheetId: string,
    input: { workDate: string; minutes: number; overtimeMinutes?: number; description?: string },
  ) {
    requirePermission(context, 'timesheets.write');
    if (input.minutes <= 0 || (input.overtimeMinutes ?? 0) > input.minutes)
      throw new ConflictError('Timesheet minutes are invalid');
    return this.database.run(context, async (tx) => {
      const timesheet = await tx.timesheet.findFirst({
        where: {
          id: timesheetId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (!timesheet || timesheet.status !== TimesheetStatus.DRAFT)
        throw new ConflictError('Only a draft timesheet can be edited');
      const overtime = input.overtimeMinutes ?? 0;
      const entry = await tx.timesheetEntry.create({
        data: {
          organizationId: context.organizationId,
          timesheetId,
          workDate: dateOnly(input.workDate),
          minutes: input.minutes,
          regularMinutes: input.minutes - overtime,
          overtimeMinutes: overtime,
          source: TimesheetEntrySource.MANUAL,
          description: input.description,
        },
      });
      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          totalMinutes: { increment: input.minutes },
          regularMinutes: { increment: input.minutes - overtime },
          overtimeMinutes: { increment: overtime },
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET',
          entityId: timesheet.id,
          action: 'TIMESHEET_MANUAL_ENTRY_ADDED',
          afterState: jsonSnapshot(entry),
        },
        tx,
      );
      return { timesheet: updated, entry };
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
      const policy = await tx.approvalPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          domain: 'TIMESHEET',
          isActive: true,
          isDefault: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: TimesheetStatus.SUBMITTED,
          submittedAt: new Date(),
          approvalPolicyId: policy?.id,
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
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async decide(
    context: DomainContext,
    timesheetId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ) {
    requirePermission(context, 'timesheets.decide');
    requireReason({ ...context, reason: comment }, 'Timesheet decisions require a comment');
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
      const pendingStep = timesheet.approvalPolicy?.steps.find(
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
        );
      const stepNumber = pendingStep?.stepNumber ?? 1;
      const hasMoreSteps = Boolean(
        timesheet.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber),
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
              comment,
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
          reason: comment,
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
      return updated;
    });
  }
}
