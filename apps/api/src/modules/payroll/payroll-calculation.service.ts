import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  PayrollRoundingMode,
  PayrollRunStatus,
  TimesheetStatus,
} from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import {
  countWorkingDays,
  hash,
  summarizeAttendance,
  summarizeLeave,
  sumTimesheets,
  unemployedDays,
} from './payroll-calculation';
import { endOfDay } from './payroll-shared';
import { calculateLine } from './payroll-line-calculator';

/**
 * Running the calculation for a whole payroll run.
 *
 * Gathers everything one run needs — compensation, policy, attendance, leave, timesheets — and
 * hands each employee to the line calculator. The per-employee arithmetic deliberately lives in
 * `payroll-line-calculator`, so this file stays about orchestration and staleness.
 */
@Injectable()
export class PayrollCalculationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async calculate(context: DomainContext, runId: string) {
    requirePermission(context, 'payroll.runs.calculate');
    return this.database.run(context, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: context.organizationId },
      });
      // A calculated run is recalculable only while it is marked stale: an input changed after the
      // figures were produced, so the figures have to catch up before anyone can approve them.
      const recalculable =
        run?.status === PayrollRunStatus.CALCULATED && run.calculationStaleAt !== null;
      if (!run || !(run.status === PayrollRunStatus.DRAFT || recalculable))
        throw new ConflictError(
          'Only a draft payroll run, or a calculated run with pending changes, can be calculated',
        );
      const unapproved = await tx.timesheet.count({
        where: {
          organizationId: context.organizationId,
          period: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart } },
          status: { not: TimesheetStatus.APPROVED },
        },
      });
      if (unapproved > 0) throw new ConflictError('Payroll can consume only approved timesheets');
      const [employees, settings, holidays, approvedLeaves, attendanceRecords] = await Promise.all([
        tx.employee.findMany({
          where: { organizationId: context.organizationId, status: 'ACTIVE' },
          orderBy: { id: 'asc' },
          include: {
            compensations: {
              where: {
                effectiveFrom: { lte: run.periodEnd },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
              },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
            payrollPolicies: {
              where: {
                effectiveFrom: { lte: run.periodEnd },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
              },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
            payComponents: {
              where: {
                effectiveFrom: { lte: run.periodEnd },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
              },
              include: { payComponent: true },
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
        tx.holiday.findMany({
          where: {
            organizationId: context.organizationId,
            isActive: true,
            holidayDate: { gte: run.periodStart, lte: run.periodEnd },
          },
          select: { holidayDate: true, branchId: true },
        }),
        tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            status: 'APPROVED',
            startDate: { lte: run.periodEnd },
            endDate: { gte: run.periodStart },
          },
          select: {
            employeeId: true,
            branchId: true,
            startDate: true,
            endDate: true,
            requestedDays: true,
            leaveType: { select: { paid: true } },
          },
        }),
        tx.attendanceRecord.findMany({
          where: {
            organizationId: context.organizationId,
            workDate: { gte: run.periodStart, lte: run.periodEnd },
          },
          select: { employeeId: true, workDate: true, dayStatus: true },
        }),
      ]);
      const timesheets = await tx.timesheet.findMany({
        where: {
          organizationId: context.organizationId,
          status: TimesheetStatus.APPROVED,
          period: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart } },
        },
      });
      const adjustments = await tx.payrollAdjustment.findMany({
        where: { payrollRunId: run.id },
        orderBy: [{ employeeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      const policy = (await tx.payrollPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          effectiveFrom: { lte: run.periodStart },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      })) ?? {
        payrollDayBasis: 30,
        basePercentage: new Prisma.Decimal(50),
        baseMinimum: new Prisma.Decimal(15000),
        hraPercentage: new Prisma.Decimal(40),
        roundingMode: PayrollRoundingMode.HALF_UP,
        pfDefault: false,
        esiDefault: false,
        ptDefault: false,
        statutoryJurisdiction: null,
        salarySlipDefault: true,
        payrollEnabledDefault: true,
      };
      const statutoryRules = await tx.payrollStatutoryRule.findMany({
        where: {
          organizationId: context.organizationId,
          ...(policy.statutoryJurisdiction ? { jurisdiction: policy.statutoryJurisdiction } : {}),
          effectiveFrom: { lte: run.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      const calendar = await tx.payrollCalendar.findFirst({
        where: {
          organizationId: context.organizationId,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
        },
        select: { salaryCreditDate: true },
      });
      const advanceCutoff = endOfDay(calendar?.salaryCreditDate ?? run.periodEnd);
      const advances = await tx.salaryAdvance.findMany({
        where: {
          organizationId: context.organizationId,
          status: { in: ['APPROVED', 'PARTIALLY_RECOVERED'] },
          approvedAt: { not: null, lte: advanceCutoff },
        },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      });
      const snapshot = employees
        .filter(
          (employee) => employee.payrollPolicies[0]?.payrollEnabled ?? policy.payrollEnabledDefault,
        )
        .map((employee) => ({
          employeeId: employee.id,
          compensation: employee.compensations[0] ?? null,
          employeePolicy: employee.payrollPolicies[0] ?? null,
          policy,
          statutoryRules,
          components: employee.payComponents.map((assignment) => ({
            id: assignment.id,
            componentId: assignment.payComponentId,
            amount: assignment.amount,
            percentage: assignment.percentage,
            component: assignment.payComponent,
          })),
          timesheet: sumTimesheets(timesheets.filter((entry) => entry.employeeId === employee.id)),
          leave: summarizeLeave(
            approvedLeaves.filter((leave) => leave.employeeId === employee.id),
            run.periodStart,
            run.periodEnd,
          ),
          attendance: summarizeAttendance(
            attendanceRecords.filter((record) => record.employeeId === employee.id),
          ),
          // Days in the period before joining or after leaving. Priced exactly like unpaid leave.
          unemployedDays: unemployedDays(
            run.periodStart,
            run.periodEnd,
            employee.dateOfJoining,
            employee.dateOfLeaving,
          ),
          periodWorkingDays: countWorkingDays(
            run.periodStart,
            run.periodEnd,
            settings.workWeekDays,
            holidays,
            employee.primaryBranchId,
          ),
          adjustments: adjustments.filter((adjustment) => adjustment.employeeId === employee.id),
          advances: advances.filter((advance) => advance.employeeId === employee.id),
        }));
      const inputSnapshotHash = hash(snapshot);
      const previousRecoveries = await tx.salaryAdvanceRecovery.findMany({
        where: { payrollRunId: run.id },
      });
      for (const recovery of previousRecoveries) {
        const advance = await tx.salaryAdvance.findUnique({
          where: { id: recovery.salaryAdvanceId },
        });
        if (!advance) continue;
        const recovered = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          advance.recoveredAmount.sub(recovery.amount),
        );
        await tx.salaryAdvance.update({
          where: { id: advance.id },
          data: {
            recoveredAmount: recovered,
            status: recovered.isZero() ? 'APPROVED' : 'PARTIALLY_RECOVERED',
          },
        });
      }
      await tx.salaryAdvanceRecovery.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollPayment.deleteMany({ where: { payrollRunId: run.id } });
      // Component rows hold the line item under `onDelete: Restrict`, so they go first. This only
      // bites on a recalculation of an employee who has assigned pay components — the path that
      // opened when a stale run became recalculable.
      await tx.payrollLineItemComponent.deleteMany({
        where: {
          organizationId: context.organizationId,
          payrollLineItem: { payrollRunId: run.id },
        },
      });
      await tx.payrollLineItem.deleteMany({ where: { payrollRunId: run.id } });
      const lines = [];
      for (const item of snapshot)
        lines.push(
          await calculateLine(
            tx,
            context.organizationId,
            run.id,
            item,
            settings.standardDayMinutes,
          ),
        );
      const calculationHash = hash(
        lines.map((line) => ({
          employeeId: line.employeeId,
          gross: line.grossAmount.toString(),
          deduction: line.deductionAmount.toString(),
          net: line.netAmount.toString(),
          components: line.components,
        })),
      );
      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollRunStatus.CALCULATED,
          inputSnapshotHash,
          calculationHash,
          calculatedAt: new Date(),
          calculationStaleAt: null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          action: 'PAYROLL_RUN_CALCULATED',
          afterState: jsonSnapshot({ run: updated, lines }),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'PayrollRun',
          aggregateId: run.id,
          aggregateVersion: updated.version,
          eventType: 'payroll.run.calculated',
          payload: jsonSnapshot({ run: updated, lines }),
        },
        tx,
      );
      return updated;
    });
  }
}
