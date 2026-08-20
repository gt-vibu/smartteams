import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  PayComponentCalculationType,
  PayComponentType,
  PayFrequency,
  PayrollAdjustmentSource,
  PayrollAdjustmentType,
  PayrollRunStatus,
  TimesheetStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import {
  calculateComponent,
  dateOnly,
  emptyHash,
  hash,
  countWorkingDays,
  sumTimesheets,
  summarizeLeave,
  payrollTransitionPermission,
  validTransition,
} from './payroll-calculation';

type ComponentInput = {
  code: string;
  name: string;
  componentType: PayComponentType;
  calculationType: PayComponentCalculationType;
  formulaDefinition?: unknown;
  isTaxable: boolean;
  displayOrder?: number;
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createComponent(context: DomainContext, input: ComponentInput) {
    requirePermission(context, 'payroll.components.write');
    return this.database.run(context, async (tx) => {
      const component = await tx.payComponent.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          componentType: input.componentType,
          calculationType: input.calculationType,
          formulaDefinition:
            input.formulaDefinition === undefined
              ? undefined
              : jsonSnapshot(input.formulaDefinition),
          isTaxable: input.isTaxable,
          displayOrder: input.displayOrder ?? 0,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAY_COMPONENT',
          entityId: component.id,
          action: 'PAY_COMPONENT_CREATED',
          afterState: jsonSnapshot(component),
        },
        tx,
      );
      return component;
    });
  }

  async listComponents(context: DomainContext) {
    requirePermission(context, 'payroll.components.read');
    return this.database.run(context, (tx) =>
      tx.payComponent.findMany({
        where: { organizationId: context.organizationId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
    );
  }
  async listRuns(context: DomainContext) {
    requirePermission(context, 'payroll.runs.read');
    return this.database.run(context, (tx) =>
      tx.payrollRun.findMany({
        where: { organizationId: context.organizationId },
        orderBy: { periodStart: 'desc' },
      }),
    );
  }
  async listPayslips(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.payslips.read');
    return this.database.run(context, async (tx) => {
      const canReadAll =
        context.permissions.has('*') || context.permissions.has('payroll.payslips.read.all');
      let employeeId = requestedEmployeeId;
      if (!canReadAll) {
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!employee) return [];
        if (requestedEmployeeId && requestedEmployeeId !== employee.id)
          throw new ConflictError('Employees may only read their own payslips');
        employeeId = employee.id;
      }
      const payslips = await tx.payslip.findMany({
        where: { organizationId: context.organizationId, employeeId },
        include: {
          payrollRun: {
            select: {
              id: true,
              periodStart: true,
              periodEnd: true,
              status: true,
              currencyCode: true,
            },
          },
          payrollLineItem: {
            select: {
              grossAmount: true,
              deductionAmount: true,
              netAmount: true,
              components: {
                orderBy: [{ displayOrder: 'asc' }, { componentCode: 'asc' }],
                select: {
                  componentCode: true,
                  componentName: true,
                  componentType: true,
                  amount: true,
                },
              },
            },
          },
          fileObject: { select: { id: true, status: true } },
        },
        orderBy: { issuedAt: 'desc' },
      });
      return payslips.map((payslip) => ({
        id: payslip.id,
        employeeId: payslip.employeeId,
        status: payslip.status,
        issuedAt: payslip.issuedAt,
        file: payslip.fileObject,
        run: payslip.payrollRun,
        totals: {
          grossAmount: payslip.payrollLineItem.grossAmount,
          deductionAmount: payslip.payrollLineItem.deductionAmount,
          netAmount: payslip.payrollLineItem.netAmount,
        },
        components: payslip.payrollLineItem.components,
      }));
    });
  }
  async ledger(context: DomainContext) {
    requirePermission(context, 'payroll.ledger.read');
    return this.database.run(context, (tx) =>
      tx.payrollLineItem.findMany({
        where: {
          organizationId: context.organizationId,
          payrollRun: { status: { in: [PayrollRunStatus.RELEASED, PayrollRunStatus.LOCKED] } },
        },
        include: { payrollRun: true, components: true },
        orderBy: [{ payrollRun: { periodStart: 'desc' } }, { employeeId: 'asc' }],
      }),
    );
  }
  async getCalendar(context: DomainContext) {
    requirePermission(context, 'payroll.calendars.read');
    return this.database.run(context, (tx) =>
      tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { payrollFrequency: true, payrollDayOfMonth: true },
      }),
    );
  }
  async updateCalendar(
    context: DomainContext,
    payrollDayOfMonth: number,
    calendar?: { year: number; month: number },
  ) {
    requirePermission(context, 'payroll.calendars.write');
    if (payrollDayOfMonth < 1 || payrollDayOfMonth > 31)
      throw new ConflictError('Payroll day must be between 1 and 31');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: { payrollDayOfMonth },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'PAYROLL_CALENDAR_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return {
        payrollFrequency: updated.payrollFrequency,
        payrollDayOfMonth: updated.payrollDayOfMonth,
        calendar,
      };
    });
  }

  async assignComponent(
    context: DomainContext,
    input: {
      employeeId: string;
      payComponentId: string;
      amount?: number;
      percentage?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
  ) {
    requirePermission(context, 'payroll.components.write');
    return this.database.run(context, async (tx) => {
      const [employee, component] = await Promise.all([
        tx.employee.findFirst({
          where: { id: input.employeeId, organizationId: context.organizationId, status: 'ACTIVE' },
        }),
        tx.payComponent.findFirst({
          where: {
            id: input.payComponentId,
            organizationId: context.organizationId,
            isActive: true,
          },
        }),
      ]);
      if (!employee) throw new NotFoundError('Employee');
      if (!component) throw new NotFoundError('Pay component');
      if (
        component.calculationType === PayComponentCalculationType.FIXED &&
        input.amount === undefined
      )
        throw new ConflictError('Fixed pay component requires an amount');
      if (
        component.calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE &&
        input.percentage === undefined
      )
        throw new ConflictError('Percentage pay component requires a percentage');
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : undefined;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Pay component assignment end must not precede its start');
      const overlap = await tx.employeePayComponent.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          payComponentId: component.id,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Pay component assignments must not overlap');
      const assignment = await tx.employeePayComponent.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          payComponentId: component.id,
          amount: input.amount,
          percentage: input.percentage,
          effectiveFrom,
          effectiveTo,
          sourceAccessMode: context.accessMode,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_PAY_COMPONENT',
          entityId: assignment.id,
          action: 'PAY_COMPONENT_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      return assignment;
    });
  }

  async createRun(
    context: DomainContext,
    input: { periodStart: string; periodEnd: string; payFrequency?: PayFrequency },
  ) {
    requirePermission(context, 'payroll.runs.write');
    return this.database.run(context, async (tx) => {
      const periodStart = dateOnly(input.periodStart);
      const periodEnd = dateOnly(input.periodEnd);
      if (periodEnd < periodStart)
        throw new ConflictError('Payroll period end must not precede its start');
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        include: { settings: true },
      });
      const run = await tx.payrollRun.create({
        data: {
          organizationId: context.organizationId,
          periodStart,
          periodEnd,
          payFrequency:
            input.payFrequency ?? organization.settings?.payrollFrequency ?? PayFrequency.MONTHLY,
          currencyCode: organization.currencyCode,
          calculationVersion: 'v1-deterministic',
          inputSnapshotHash: emptyHash(),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          action: 'PAYROLL_RUN_CREATED',
          afterState: jsonSnapshot(run),
        },
        tx,
      );
      return run;
    });
  }

  async calculate(context: DomainContext, runId: string) {
    requirePermission(context, 'payroll.runs.calculate');
    return this.database.run(context, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: context.organizationId },
      });
      if (!run || run.status !== PayrollRunStatus.DRAFT)
        throw new ConflictError('Only a draft payroll run can be calculated');
      const unapproved = await tx.timesheet.count({
        where: {
          organizationId: context.organizationId,
          period: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart } },
          status: { not: TimesheetStatus.APPROVED },
        },
      });
      if (unapproved > 0) throw new ConflictError('Payroll can consume only approved timesheets');
      const [employees, settings, holidays, approvedLeaves] = await Promise.all([
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
            requestedDays: true,
            leaveType: { select: { paid: true } },
          },
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
      const snapshot = employees.map((employee) => ({
        employeeId: employee.id,
        compensation: employee.compensations[0] ?? null,
        components: employee.payComponents.map((assignment) => ({
          id: assignment.id,
          componentId: assignment.payComponentId,
          amount: assignment.amount,
          percentage: assignment.percentage,
          component: assignment.payComponent,
        })),
        timesheet: sumTimesheets(timesheets.filter((entry) => entry.employeeId === employee.id)),
        leave: summarizeLeave(approvedLeaves.filter((leave) => leave.employeeId === employee.id)),
        periodWorkingDays: countWorkingDays(
          run.periodStart,
          run.periodEnd,
          settings.workWeekDays,
          holidays,
          employee.primaryBranchId,
        ),
        adjustments: adjustments.filter((adjustment) => adjustment.employeeId === employee.id),
      }));
      const inputSnapshotHash = hash(snapshot);
      await tx.payrollLineItem.deleteMany({ where: { payrollRunId: run.id } });
      const lines = [];
      for (const item of snapshot)
        lines.push(
          await this.calculateLine(
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

  async addAdjustment(
    context: DomainContext,
    input: {
      payrollRunId: string;
      employeeId: string;
      type: PayrollAdjustmentType;
      amount: number;
      description: string;
      taxable: boolean;
      externalId?: string;
      source: PayrollAdjustmentSource;
    },
  ) {
    requirePermission(context, 'payroll.adjustments.write');
    requireReason(
      { ...context, reason: input.description },
      'Payroll adjustment requires a description',
    );
    return this.database.run(context, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: {
          id: input.payrollRunId,
          organizationId: context.organizationId,
          status: { in: [PayrollRunStatus.DRAFT, PayrollRunStatus.CALCULATED] },
        },
      });
      if (!run) throw new ConflictError('Payroll run is not editable');
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, organizationId: context.organizationId },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (!Number.isFinite(input.amount) || input.amount < 0)
        throw new ConflictError('Payroll adjustment amount must be a non-negative number');
      const adjustment = await tx.payrollAdjustment.create({
        data: {
          organizationId: context.organizationId,
          payrollRunId: run.id,
          employeeId: input.employeeId,
          type: input.type,
          source: input.source,
          description: input.description,
          amount: new Prisma.Decimal(input.amount),
          taxable: input.taxable,
          externalId: input.externalId,
          createdByUserId: context.actor.userId,
          createdByClientId: context.actor.clientId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_ADJUSTMENT',
          entityId: adjustment.id,
          action: 'PAYROLL_ADJUSTMENT_CREATED',
          afterState: jsonSnapshot(adjustment),
          reason: input.description,
        },
        tx,
      );
      return adjustment;
    });
  }

  async advance(context: DomainContext, runId: string, target: PayrollRunStatus, comment: string) {
    requirePermission(context, payrollTransitionPermission(target));
    requireReason({ ...context, reason: comment }, 'Payroll state changes require a reason');
    return this.database.run(context, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: context.organizationId },
      });
      if (!run || !validTransition(run.status, target))
        throw new ConflictError(
          `Invalid payroll transition from ${run?.status ?? 'missing'} to ${target}`,
        );
      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: target,
          approvedAt: target === PayrollRunStatus.APPROVED ? new Date() : undefined,
          releasedAt: target === PayrollRunStatus.RELEASED ? new Date() : undefined,
          lockedAt: target === PayrollRunStatus.LOCKED ? new Date() : undefined,
          version: { increment: 1 },
          approvals:
            target === PayrollRunStatus.APPROVED && context.actor.userId
              ? {
                  create: {
                    organizationId: context.organizationId,
                    approverUserId: context.actor.userId,
                    status: 'APPROVED',
                    comment,
                  },
                }
              : undefined,
        },
      });
      if (target === PayrollRunStatus.RELEASED)
        await this.createPayslips(tx, context.organizationId, run.id);
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          action: `PAYROLL_RUN_${target}`,
          beforeState: jsonSnapshot(run),
          afterState: jsonSnapshot(updated),
          reason: comment,
        },
        tx,
      );
      return updated;
    });
  }

  private async calculateLine(
    tx: Prisma.TransactionClient,
    organizationId: string,
    payrollRunId: string,
    item: {
      employeeId: string;
      compensation: { baseAmount: Prisma.Decimal; overtimeMultiplier: Prisma.Decimal } | null;
      components: Array<{
        componentId: string;
        amount: Prisma.Decimal | null;
        percentage: Prisma.Decimal | null;
        component: {
          id: string;
          code: string;
          name: string;
          componentType: PayComponentType;
          calculationType: PayComponentCalculationType;
          formulaDefinition: unknown;
          isTaxable: boolean;
          displayOrder: number;
        };
      }>;
      timesheet: { regularMinutes: number; overtimeMinutes: number } | null;
      leave: { paidDays: number; unpaidDays: number };
      periodWorkingDays: number;
      adjustments: Array<{
        type: PayrollAdjustmentType;
        amount: Prisma.Decimal;
        description: string;
      }>;
    },
    standardDayMinutes: number,
  ) {
    const base = item.compensation?.baseAmount ?? new Prisma.Decimal(0);
    const unpaidLeaveAdjustment = base.mul(item.leave.unpaidDays).div(item.periodWorkingDays);
    const regular = base.sub(unpaidLeaveAdjustment);
    const overtime =
      item.compensation && item.timesheet
        ? base
            .div(standardDayMinutes * item.periodWorkingDays)
            .mul(item.timesheet.overtimeMinutes)
            .mul(item.compensation.overtimeMultiplier)
        : new Prisma.Decimal(0);
    const components = item.components
      .slice()
      .sort(
        (a, b) =>
          a.component.displayOrder - b.component.displayOrder ||
          a.component.code.localeCompare(b.component.code),
      )
      .map((assignment) => ({
        assignment,
        amount: calculateComponent(assignment, base.add(overtime)),
      }));
    const adjustmentTotal = item.adjustments.reduce(
      (sum, adjustment) => sum.add(adjustment.amount),
      new Prisma.Decimal(0),
    );
    const gross = components
      .filter(({ assignment }) => assignment.component.componentType === PayComponentType.EARNING)
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0))
      .add(adjustmentTotal)
      .add(regular);
    const deduction = components
      .filter(({ assignment }) => assignment.component.componentType === PayComponentType.DEDUCTION)
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    const net = gross.sub(deduction);
    const line = await tx.payrollLineItem.create({
      data: {
        organizationId,
        payrollRunId,
        employeeId: item.employeeId,
        grossAmount: gross,
        deductionAmount: deduction,
        netAmount: net,
        regularAmount: regular,
        overtimeAmount: overtime,
        leaveAmount: base.mul(item.leave.paidDays).div(item.periodWorkingDays),
        inputSnapshot: jsonSnapshot(item),
        calculationBreakdown: jsonSnapshot({
          base,
          regular,
          overtime,
          adjustmentTotal,
          unpaidLeaveAdjustment,
          paidLeaveDays: item.leave.paidDays,
          unpaidLeaveDays: item.leave.unpaidDays,
          periodWorkingDays: item.periodWorkingDays,
        }),
        components: {
          create: components.map(({ assignment, amount }) => ({
            organizationId,
            payComponentId: assignment.component.id,
            componentCode: assignment.component.code,
            componentName: assignment.component.name,
            componentType: assignment.component.componentType,
            calculationType: assignment.component.calculationType,
            amount,
            isTaxable: assignment.component.isTaxable,
            calculationSnapshot: jsonSnapshot(assignment),
            displayOrder: assignment.component.displayOrder,
          })),
        },
      },
    });
    return {
      employeeId: item.employeeId,
      grossAmount: gross,
      deductionAmount: deduction,
      netAmount: net,
      components: components.map(({ assignment, amount }) => ({
        code: assignment.component.code,
        amount,
      })),
      lineId: line.id,
    };
  }

  private async createPayslips(
    tx: Prisma.TransactionClient,
    organizationId: string,
    payrollRunId: string,
  ) {
    const lines = await tx.payrollLineItem.findMany({ where: { organizationId, payrollRunId } });
    for (const line of lines)
      await tx.payslip.upsert({
        where: { payrollLineItemId: line.id },
        create: {
          organizationId,
          payrollRunId,
          payrollLineItemId: line.id,
          employeeId: line.employeeId,
          status: 'PENDING_UPLOAD',
          issuedAt: new Date(),
        },
        update: { issuedAt: new Date() },
      });
  }
}
