import { Injectable } from '@nestjs/common';
import {
  TimesheetEntrySource,
  TimesheetPeriodType,
  TimesheetStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { assertApprover } from '../approvals/approval-authorization';

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(context: DomainContext, filters: { employeeId?: string; periodId?: string }) {
    requirePermission(context, 'timesheets.read');
    return this.database.run(context, async (tx) => {
      let employeeId = filters.employeeId;
      if (!(context.permissions.has('*') || context.permissions.has('timesheets.read.all'))) {
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!employee) return [];
        if (employeeId && employeeId !== employee.id)
          throw new ConflictError('Employees may only read their own timesheets');
        employeeId = employee.id;
      }
      const timesheets = await tx.timesheet.findMany({
        // Bounded: a period across a large tenant is otherwise one unbounded response.
        take: 500,
        where: {
          organizationId: context.organizationId,
          employeeId,
          timesheetPeriodId: filters.periodId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: { entries: { orderBy: { workDate: 'asc' } }, period: true },
        orderBy: [{ period: { periodStart: 'desc' } }, { employeeId: 'asc' }],
      });
      return timesheets.map((timesheet) => ({
        id: timesheet.id,
        employeeId: timesheet.employeeId,
        periodId: timesheet.timesheetPeriodId,
        period: timesheet.period,
        status: timesheet.status,
        totalMinutes: timesheet.totalMinutes,
        regularMinutes: timesheet.regularMinutes,
        overtimeMinutes: timesheet.overtimeMinutes,
        version: timesheet.version,
        entries: timesheet.entries,
      }));
    });
  }

  async createPeriod(
    context: DomainContext,
    input: { periodType: TimesheetPeriodType; periodStart: string; periodEnd: string },
  ) {
    requirePermission(context, 'timesheets.write');
    return this.database.run(context, async (tx) => {
      const period = await tx.timesheetPeriod.upsert({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId: context.organizationId,
            periodStart: dateOnly(input.periodStart),
            periodEnd: dateOnly(input.periodEnd),
          },
        },
        create: {
          organizationId: context.organizationId,
          periodType: input.periodType,
          periodStart: dateOnly(input.periodStart),
          periodEnd: dateOnly(input.periodEnd),
          status: TimesheetStatus.DRAFT,
        },
        update: { periodType: input.periodType },
      });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET_PERIOD',
          entityId: period.id,
          action: 'TIMESHEET_PERIOD_CREATED',
          afterState: jsonSnapshot(period),
        },
        tx,
      );
      return period;
    });
  }

  async derive(context: DomainContext, periodId: string) {
    requirePermission(context, 'timesheets.write');
    return this.database.run(context, async (tx) => {
      const period = await tx.timesheetPeriod.findFirst({
        where: { id: periodId, organizationId: context.organizationId },
      });
      if (!period || period.status !== TimesheetStatus.DRAFT)
        throw new ConflictError('Timesheet period is unavailable for derivation');
      const employees = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          ...(context.branchId
            ? {
                OR: [
                  { primaryBranchId: context.branchId },
                  { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
                ],
              }
            : {}),
        },
        select: { id: true, primaryBranchId: true },
      });
      const records = await tx.attendanceRecord.findMany({
        where: {
          organizationId: context.organizationId,
          workDate: { gte: period.periodStart, lte: period.periodEnd },
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        select: {
          id: true,
          employeeId: true,
          branchId: true,
          workDate: true,
          workedMinutes: true,
          overtimeMinutes: true,
        },
      });
      /*
       * Set-based, not per-employee.
       *
       * This loop previously ran an upsert, a delete, one insert per attendance record and an
       * update for every employee — around twenty-three round trips each, all sequential, all
       * inside one open transaction. At ten thousand employees that is a couple of hundred
       * thousand queries holding locks for the duration, which does not finish. It also grouped
       * records with `.filter()` inside the loop, making the grouping itself quadratic.
       *
       * The work below is the same work in a fixed number of statements, whatever the headcount.
       */
      const recordsByEmployee = new Map<string, typeof records>();
      for (const record of records) {
        const bucket = recordsByEmployee.get(record.employeeId);
        if (bucket) bucket.push(record);
        else recordsByEmployee.set(record.employeeId, [record]);
      }

      const existing = await tx.timesheet.findMany({
        where: { organizationId: context.organizationId, timesheetPeriodId: period.id },
        select: { id: true, employeeId: true },
      });
      const existingByEmployee = new Map(existing.map((sheet) => [sheet.employeeId, sheet.id]));

      const missing = employees.filter((employee) => !existingByEmployee.has(employee.id));
      if (missing.length > 0)
        await tx.timesheet.createMany({
          data: missing.map((employee) => ({
            organizationId: context.organizationId,
            timesheetPeriodId: period.id,
            employeeId: employee.id,
            branchId: context.branchId ?? employee.primaryBranchId,
            status: TimesheetStatus.DRAFT,
            sourceAccessMode: context.accessMode,
          })),
        });

      // Re-read so newly created sheets carry their ids. Derivation resets every sheet in the
      // period to draft, exactly as the per-employee upsert did.
      const sheets = await tx.timesheet.findMany({
        where: {
          organizationId: context.organizationId,
          timesheetPeriodId: period.id,
          employeeId: { in: employees.map((employee) => employee.id) },
        },
        select: { id: true, employeeId: true },
      });
      const sheetIds = sheets.map((sheet) => sheet.id);

      await tx.timesheet.updateMany({
        where: { id: { in: sheetIds } },
        data: { status: TimesheetStatus.DRAFT, version: { increment: 1 } },
      });

      // Attendance-derived entries are rebuilt wholesale; manual entries are left alone.
      await tx.timesheetEntry.deleteMany({
        where: { timesheetId: { in: sheetIds }, source: TimesheetEntrySource.ATTENDANCE },
      });

      const entries = sheets.flatMap((sheet) =>
        (recordsByEmployee.get(sheet.employeeId) ?? []).map((record) => ({
          organizationId: context.organizationId,
          timesheetId: sheet.id,
          attendanceRecordId: record.id,
          workDate: record.workDate,
          minutes: record.workedMinutes,
          regularMinutes: record.workedMinutes - record.overtimeMinutes,
          overtimeMinutes: record.overtimeMinutes,
          source: TimesheetEntrySource.ATTENDANCE,
        })),
      );
      if (entries.length > 0) await tx.timesheetEntry.createMany({ data: entries });

      // Totals differ per sheet, so they cannot be one `updateMany`. Grouping by the figures
      // keeps this to a handful of statements — most employees in a period share a total.
      const byTotals = new Map<string, string[]>();
      for (const sheet of sheets) {
        const own = recordsByEmployee.get(sheet.employeeId) ?? [];
        const totalMinutes = own.reduce((sum, record) => sum + record.workedMinutes, 0);
        const overtimeMinutes = own.reduce((sum, record) => sum + record.overtimeMinutes, 0);
        const key = `${totalMinutes}:${overtimeMinutes}`;
        const bucket = byTotals.get(key);
        if (bucket) bucket.push(sheet.id);
        else byTotals.set(key, [sheet.id]);
      }
      for (const [key, ids] of byTotals) {
        const [totalMinutes = 0, overtimeMinutes = 0] = key.split(':').map(Number);
        await tx.timesheet.updateMany({
          where: { id: { in: ids } },
          data: { totalMinutes, regularMinutes: totalMinutes - overtimeMinutes, overtimeMinutes },
        });
      }

      const results = await tx.timesheet.findMany({ where: { id: { in: sheetIds } } });
      await this.audit.record(
        context,
        {
          entityType: 'TIMESHEET_PERIOD',
          entityId: period.id,
          action: 'TIMESHEETS_DERIVED',
          afterState: jsonSnapshot({ count: results.length }),
        },
        tx,
      );
      return results;
    });
  }

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

function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}
