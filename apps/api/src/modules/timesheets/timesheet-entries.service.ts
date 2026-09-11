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
import { assertApprover, assertResolvableApprovers } from '../approvals/approval-authorization';
import { assertMayActForEmployee } from '../employees/employee-scope';

import { toProjectDto } from '../platform/workforce-mappers';
import {
  dateOnly,
  decodeEntry,
  encodeEntryDescription,
  DEFAULT_JOB_TYPES,
  derivePeriodBounds,
} from './timesheet-shared';
import type { ManualEntryDto } from './timesheets.dto';

@Injectable()
export class TimesheetEntriesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listJobTypes(context: DomainContext) {
    requirePermission(context, 'timesheets.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { metadata: true },
      });
      const meta =
        typeof settings?.metadata === 'object' &&
        settings.metadata !== null &&
        !Array.isArray(settings.metadata)
          ? (settings.metadata as Record<string, unknown>)
          : {};
      const customJobs = Array.isArray(meta.jobTypes) ? (meta.jobTypes as string[]) : [];
      const allNames = Array.from(new Set([...DEFAULT_JOB_TYPES, ...customJobs]));
      return allNames.map((name) => ({ id: name, name }));
    });
  }

  async createJobType(context: DomainContext, name: string) {
    requirePermission(context, 'timesheets.write');
    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) throw new ConflictError('Job type name is invalid');
    return this.database.run(context, async (tx) => {
      // Ensure the organization settings row exists before row-locking
      await tx.organizationSettings.upsert({
        where: { organizationId: context.organizationId },
        create: {
          organizationId: context.organizationId,
          metadata: {},
        },
        update: {},
      });
      // Acquire row-level lock on organization settings to serialize concurrent job-type creations
      await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${context.organizationId}::uuid FOR UPDATE`;

      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
      });
      const meta =
        typeof settings?.metadata === 'object' &&
        settings.metadata !== null &&
        !Array.isArray(settings.metadata)
          ? (settings.metadata as { jobTypes?: string[] })
          : {};
      const current = Array.isArray(meta.jobTypes) ? meta.jobTypes : [];
      if (!current.includes(cleanName)) {
        const updatedJobs = [...current, cleanName];
        await tx.organizationSettings.update({
          where: { organizationId: context.organizationId },
          data: {
            metadata: { ...meta, jobTypes: updatedJobs },
          },
        });
        await this.audit.record(
          context,
          {
            entityType: 'JOB_TYPE',
            entityId: cleanName,
            action: 'JOB_TYPE_CREATED',
            afterState: jsonSnapshot({ name: cleanName }),
          },
          tx,
        );
      }
      return { id: cleanName, name: cleanName };
    });
  }

  async quickCreateProject(context: DomainContext, name: string, description?: string) {
    requirePermission(context, 'timesheets.write');
    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) throw new ConflictError('Project name is invalid');
    return this.database.run(context, async (tx) => {
      const codeBase =
        cleanName
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 6)
          .toUpperCase() || 'PRJ';
      let code = codeBase;
      let counter = 1;
      while (
        await tx.project.findFirst({
          where: { organizationId: context.organizationId, code },
          select: { id: true },
        })
      ) {
        code = `${codeBase}-${counter++}`;
      }
      const project = await tx.project.create({
        data: {
          organizationId: context.organizationId,
          code,
          name: cleanName,
          description: description?.trim() || undefined,
          status: 'ACTIVE',
        },
      });

      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, userId: context.actor.userId },
        select: { id: true },
      });
      if (employee) {
        await tx.projectMember.create({
          data: {
            organizationId: context.organizationId,
            projectId: project.id,
            employeeId: employee.id,
            projectRole: 'Contributor',
            startsOn: new Date(),
          },
        });
      }

      await this.audit.record(
        context,
        {
          entityType: 'PROJECT',
          entityId: project.id,
          action: 'PROJECT_QUICK_CREATED',
          afterState: jsonSnapshot(project),
        },
        tx,
      );
      return toProjectDto({ ...project, members: [] });
    });
  }

  async addManualEntry(
    context: DomainContext,
    timesheetId: string | undefined,
    input: ManualEntryDto,
  ) {
    requirePermission(context, 'timesheets.write');
    if (input.minutes <= 0 || (input.overtimeMinutes ?? 0) > input.minutes)
      throw new ConflictError('Timesheet minutes are invalid');
    const workDateObj = dateOnly(input.workDate);

    return this.database.run(context, async (tx) => {
      let targetTimesheetId = timesheetId || input.timesheetId;

      if (!targetTimesheetId) {
        // Resolve or provision the employee's active timesheet for the work date so the employee is
        // never blocked by a missing admin-created timesheet period.
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true, primaryBranchId: true },
        });
        if (!employee) throw new ConflictError('Employee profile not found for user');

        // Check if an existing timesheet period already covers this work date
        let period = await tx.timesheetPeriod.findFirst({
          where: {
            organizationId: context.organizationId,
            periodStart: { lte: workDateObj },
            periodEnd: { gte: workDateObj },
          },
          orderBy: { periodStart: 'desc' },
        });

        if (!period) {
          // Read organizational payroll/timesheet cadence settings
          const orgSettings = await tx.organizationSettings.findUnique({
            where: { organizationId: context.organizationId },
            select: { payrollFrequency: true },
          });

          const derived = derivePeriodBounds(workDateObj, orgSettings?.payrollFrequency);

          period = await tx.timesheetPeriod.upsert({
            where: {
              organizationId_periodStart_periodEnd: {
                organizationId: context.organizationId,
                periodStart: derived.periodStart,
                periodEnd: derived.periodEnd,
              },
            },
            create: {
              organizationId: context.organizationId,
              periodType: derived.periodType,
              periodStart: derived.periodStart,
              periodEnd: derived.periodEnd,
              status: TimesheetStatus.DRAFT,
            },
            update: {},
          });
        }

        const timesheet = await tx.timesheet.upsert({
          where: {
            employeeId_timesheetPeriodId: {
              employeeId: employee.id,
              timesheetPeriodId: period.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            timesheetPeriodId: period.id,
            employeeId: employee.id,
            branchId: context.branchId ?? employee.primaryBranchId,
            status: TimesheetStatus.DRAFT,
            sourceAccessMode: context.accessMode,
          },
          update: {},
        });
        targetTimesheetId = timesheet.id;
      }

      const timesheet = await tx.timesheet.findFirst({
        where: {
          id: targetTimesheetId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (
        !timesheet ||
        (timesheet.status !== TimesheetStatus.DRAFT &&
          timesheet.status !== TimesheetStatus.SUBMITTED &&
          timesheet.status !== TimesheetStatus.REJECTED)
      )
        throw new ConflictError('Only an editable timesheet can accept new time entries');
      // The branch above provisions the caller's own sheet, but a supplied `timesheetId` reaches
      // any sheet in the tenant — including a colleague's. Ownership is read off the row.
      await assertMayActForEmployee(tx, context, timesheet.employeeId, 'timesheets.read.all');

      // Verify project access if specified
      let resolvedProjectName = input.projectName;
      if (input.projectId) {
        const project = await tx.project.findFirst({
          where: { id: input.projectId, organizationId: context.organizationId },
          select: { id: true, name: true },
        });
        if (!project) throw new ConflictError('Project not found or inaccessible');
        resolvedProjectName = project.name;
      }

      const overtime = input.overtimeMinutes ?? 0;
      const encodedDescription = encodeEntryDescription({
        ...input,
        projectName: resolvedProjectName,
      });

      const entry = await tx.timesheetEntry.create({
        data: {
          organizationId: context.organizationId,
          timesheetId: targetTimesheetId,
          workDate: workDateObj,
          minutes: input.minutes,
          regularMinutes: input.minutes - overtime,
          overtimeMinutes: overtime,
          source: TimesheetEntrySource.MANUAL,
          description: encodedDescription,
        },
      });
      const updated = await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: TimesheetStatus.DRAFT,
          submittedAt: null,
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
      return { timesheet: updated, entry: decodeEntry(entry) };
    });
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
