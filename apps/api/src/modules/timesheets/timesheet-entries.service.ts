import { Injectable } from '@nestjs/common';
import { TimesheetEntrySource, TimesheetStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
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

const MINUTES_PER_DAY = 24 * 60;

/**
 * Recording time: job types, projects created from the Log Time form, and manual entries.
 *
 * Moving a sheet through approval is `TimesheetLifecycleService`; building a period from
 * attendance is `TimesheetPeriodsService`.
 */
@Injectable()
export class TimesheetEntriesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
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

  /**
   * A project created from the Log Time form.
   *
   * Held to `projects.write`, the permission the Projects module requires to create the same row.
   * This route used to check only `timesheets.write`, which every employee holds, so anyone could
   * create organization-wide projects from a timesheet that they could not create on the Projects
   * screen — a second way in with a weaker lock.
   */
  async quickCreateProject(context: DomainContext, name: string, description?: string) {
    requirePermission(context, 'projects.write');
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
      // Minutes are the caller's own figure, and approved sheets are what hourly pay is computed
      // from. Nothing bounded them: one entry of 100,000 minutes on a single day was accepted. A
      // day still has 24 hours, so the day's recorded time — attendance-derived entries included —
      // may not pass that. The approver remains the judge of anything plausible.
      const alreadyLogged = await tx.timesheetEntry.aggregate({
        where: { timesheetId: timesheet.id, workDate: workDateObj },
        _sum: { minutes: true },
      });
      if ((alreadyLogged._sum.minutes ?? 0) + input.minutes > MINUTES_PER_DAY)
        throw new ConflictError('A day has 24 hours; this entry would record more than that');

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
}
