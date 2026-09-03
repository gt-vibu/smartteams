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
  AccessMode,
  PayrollRoundingMode,
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
  summarizeAttendance,
  unemployedDays,
  payrollTransitionPermission,
  validTransition,
} from './payroll-calculation';
import {
  allocateAdvanceRecovery,
  calculateSalaryStructure,
  calculateStatutoryDeduction,
  prorateSalaryStructure,
} from './payroll-salary-structure';

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
    validateComponentInput(input);
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

  async updateComponent(context: DomainContext, id: string, input: ComponentInput) {
    requirePermission(context, 'payroll.components.write');
    validateComponentInput(input);
    return this.database.run(context, async (tx) => {
      const existing = await tx.payComponent.findFirst({
        where: { id, organizationId: context.organizationId, isActive: true },
      });
      if (!existing) throw new NotFoundError('Pay component');
      const component = await tx.payComponent.update({
        where: { id: existing.id },
        data: {
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          componentType: input.componentType,
          calculationType: input.calculationType,
          formulaDefinition:
            input.formulaDefinition === undefined
              ? Prisma.JsonNull
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
          action: 'PAY_COMPONENT_UPDATED',
          beforeState: jsonSnapshot(existing),
          afterState: jsonSnapshot(component),
        },
        tx,
      );
      return component;
    });
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
      if (context.accessMode === AccessMode.FEDERATION && !requestedEmployeeId && !canReadAll)
        return [];
      if (!canReadAll && !requestedEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            organizationId: context.organizationId,
            userId: context.actor.userId,
            ...this.employeeScope(context),
          },
          select: { id: true },
        });
        if (!employee) return [];
        employeeId = employee.id;
      } else if (!canReadAll && requestedEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            id: requestedEmployeeId,
            organizationId: context.organizationId,
            userId: context.actor.userId,
            ...this.employeeScope(context),
          },
          select: { id: true },
        });
        if (!employee) throw new ConflictError('Employees may only read their own payslips');
      }
      const payslips = await tx.payslip.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
        },
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
              inputSnapshot: true,
              calculationBreakdown: true,
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
          employee: { select: { externalId: true, employeeNumber: true } },
          fileObject: { select: { id: true, status: true } },
        },
        orderBy: { issuedAt: 'desc' },
      });
      return payslips.map((payslip) => ({
        id: payslip.id,
        employeeId: payslip.employeeId,
        externalEmployeeId: payslip.employee.externalId,
        employeeNumber: payslip.employee.employeeNumber,
        status: payslip.status,
        issuedAt: payslip.issuedAt,
        file: payslip.fileObject,
        run: payslip.payrollRun,
        totals: {
          grossAmount: payslip.payrollLineItem.grossAmount,
          deductionAmount: payslip.payrollLineItem.deductionAmount,
          netAmount: payslip.payrollLineItem.netAmount,
        },
        components:
          canReadAll || detailedSalarySlipAllowed(payslip.payrollLineItem.inputSnapshot)
            ? mergeSalaryComponents(
                payslip.payrollLineItem.components,
                payslip.payrollLineItem.calculationBreakdown,
              )
            : [],
      }));
    });
  }
  async ledger(
    context: DomainContext,
    requestedEmployeeId?: string,
    pagination: { cursor?: string; limit?: number } = {},
  ) {
    requirePermission(context, 'payroll.ledger.read');
    return this.database.run(context, async (tx) => {
      const canReadAll =
        context.permissions.has('*') || context.permissions.has('payroll.ledger.read.all');
      let employeeId = requestedEmployeeId;
      if (context.accessMode === AccessMode.FEDERATION && !requestedEmployeeId && !canReadAll)
        return { entries: [], nextCursor: undefined };
      if (!canReadAll && !requestedEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            organizationId: context.organizationId,
            userId: context.actor.userId,
            ...this.employeeScope(context),
          },
          select: { id: true },
        });
        if (!employee) return { entries: [], nextCursor: undefined };
        employeeId = employee.id;
      } else if (!canReadAll && requestedEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            id: requestedEmployeeId,
            organizationId: context.organizationId,
            userId: context.actor.userId,
            ...this.employeeScope(context),
          },
          select: { id: true },
        });
        if (!employee) throw new ConflictError('Employees may only read their own payroll ledger');
      }
      const cursorId = pagination.cursor ? decodePayrollCursor(pagination.cursor) : undefined;
      const limit = Math.min(pagination.limit ?? 100, 500);
      const entries = await tx.payrollLineItem.findMany({
        where: {
          organizationId: context.organizationId,
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
          payrollRun: { status: { in: [PayrollRunStatus.RELEASED, PayrollRunStatus.LOCKED] } },
        },
        include: {
          employee: { select: { externalId: true, employeeNumber: true } },
          payrollRun: true,
          components: true,
        },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        orderBy: [{ payrollRun: { periodStart: 'desc' } }, { employeeId: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });
      const hasNextPage = entries.length > limit;
      const page = entries.slice(0, limit);
      return {
        entries: page.map((entry) => ({
          id: entry.id,
          externalEmployeeId: entry.employee.externalId,
          employeeNumber: entry.employee.employeeNumber,
          payrollRunId: entry.payrollRunId,
          grossAmount: entry.grossAmount,
          deductionAmount: entry.deductionAmount,
          netAmount: entry.netAmount,
          payrollRun: entry.payrollRun,
          components: entry.components,
        })),
        nextCursor: hasNextPage ? encodePayrollCursor(page.at(-1)?.id) : undefined,
      };
    });
  }

  async listEmployeeComponents(context: DomainContext, employeeId: string) {
    requirePermission(context, 'payroll.components.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          organizationId: context.organizationId,
          ...this.employeeScope(context),
        },
        select: { id: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      return tx.employeePayComponent.findMany({
        where: { organizationId: context.organizationId, employeeId },
        include: { payComponent: true },
        orderBy: [{ effectiveFrom: 'desc' }, { payComponent: { displayOrder: 'asc' } }],
      });
    });
  }
  async getCalendar(
    context: DomainContext,
    year = new Date().getUTCFullYear(),
    month = new Date().getUTCMonth() + 1,
  ) {
    requirePermission(context, 'payroll.calendars.read');
    validateCalendarMonth(year, month);
    return this.database.run(context, async (tx) => {
      const [settings, calendar] = await Promise.all([
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
          select: { payrollFrequency: true, payrollDayOfMonth: true },
        }),
        tx.payrollCalendar.findUnique({
          where: {
            organizationId_year_month: { organizationId: context.organizationId, year, month },
          },
        }),
      ]);
      return { ...settings, calendar };
    });
  }
  async updateCalendar(
    context: DomainContext,
    input: {
      year: number;
      month: number;
      periodStart?: string;
      periodEnd?: string;
      attendanceFreezeDate?: string;
      calculationDate?: string;
      releaseDate?: string;
      salaryCreditDate?: string;
    },
  ) {
    requirePermission(context, 'payroll.calendars.write');
    validateCalendarMonth(input.year, input.month);
    const periodStart = dateOnly(
      input.periodStart ?? `${input.year}-${String(input.month).padStart(2, '0')}-01`,
    );
    const periodEnd = dateOnly(
      input.periodEnd ??
        `${input.year}-${String(input.month).padStart(2, '0')}-${String(new Date(Date.UTC(input.year, input.month, 0)).getUTCDate()).padStart(2, '0')}`,
    );
    if (periodEnd < periodStart)
      throw new ConflictError('Payroll period end must be after its start');
    const dates = {
      attendanceFreezeDate: input.attendanceFreezeDate
        ? dateOnly(input.attendanceFreezeDate)
        : null,
      calculationDate: input.calculationDate ? dateOnly(input.calculationDate) : null,
      releaseDate: input.releaseDate ? dateOnly(input.releaseDate) : null,
      salaryCreditDate: input.salaryCreditDate ? dateOnly(input.salaryCreditDate) : null,
    };
    if (dates.attendanceFreezeDate && dates.attendanceFreezeDate > periodEnd)
      throw new ConflictError('Attendance freeze cannot be after the payroll period');
    if (dates.calculationDate && dates.calculationDate < periodStart)
      throw new ConflictError('Calculation date cannot be before the payroll period');
    if (dates.releaseDate && dates.releaseDate < periodStart)
      throw new ConflictError('Release date cannot be before the payroll period');
    if (dates.salaryCreditDate && dates.salaryCreditDate < periodStart)
      throw new ConflictError('Salary credit date cannot be before the payroll period');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const updated = await tx.payrollCalendar.upsert({
        where: {
          organizationId_year_month: {
            organizationId: context.organizationId,
            year: input.year,
            month: input.month,
          },
        },
        create: {
          organizationId: context.organizationId,
          year: input.year,
          month: input.month,
          periodStart,
          periodEnd,
          ...dates,
        },
        update: { periodStart, periodEnd, ...dates },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_CALENDAR',
          entityId: updated.id,
          action: 'PAYROLL_CALENDAR_UPDATED',
          beforeState: jsonSnapshot({ settings: before }),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return {
        payrollFrequency: before.payrollFrequency,
        payrollDayOfMonth: before.payrollDayOfMonth,
        calendar: updated,
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
          where: {
            id: input.employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...this.employeeScope(context),
          },
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
      if (input.amount !== undefined && input.percentage !== undefined)
        throw new ConflictError('Pay component assignment cannot set both amount and percentage');
      if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0))
        throw new ConflictError('Pay component amount must be a non-negative number');
      if (
        input.percentage !== undefined &&
        (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100)
      )
        throw new ConflictError('Pay component percentage must be between 0 and 100');
      if (
        component.calculationType === PayComponentCalculationType.FIXED &&
        input.amount === undefined &&
        !hasDefaultValue(component.formulaDefinition, 'FIXED')
      )
        throw new ConflictError('Fixed pay component requires an amount');
      if (
        component.calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE &&
        input.percentage === undefined &&
        !hasDefaultValue(component.formulaDefinition, 'PERCENTAGE_OF_BASE')
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
      if (run.status === PayrollRunStatus.CALCULATED)
        await tx.payrollRun.update({
          where: { id: run.id },
          data: { calculationStaleAt: new Date(), version: { increment: 1 } },
        });
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

  /**
   * Supersedes a released payroll run with a correction.
   *
   * PRD FR-38: payroll must never be mutable retroactively, and a correction must preserve the
   * original and the correction as separate auditable entries. So nothing about the released run
   * changes except its status — its line items, payslips and payments stay exactly as paid — and
   * the correction is a fresh draft for the same period, linked back by `correctionOfRunId`.
   *
   * Until now `CORRECTED` was a state nothing could reach: a wrong figure that got as far as
   * release was permanent. The schema always carried the self-relation for this; only the
   * transition was missing.
   *
   * The replacement starts as a DRAFT, so it goes through calculate, approve and release like any
   * other run rather than appearing as an already-blessed set of numbers.
   */
  async correct(context: DomainContext, runId: string, reason: string) {
    requirePermission(context, 'payroll.runs.correct');
    requireReason({ ...context, reason }, 'A payroll correction requires a reason');
    return this.database.run(context, async (tx) => {
      const original = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: context.organizationId },
      });
      if (!original || !validTransition(original.status, PayrollRunStatus.CORRECTED))
        throw new ConflictError(
          `Only a released or locked payroll run can be corrected; this one is ${original?.status ?? 'missing'}`,
        );

      // One live run per period at a time. The database unique now spans the correction link so a
      // replacement can exist alongside its original, which means "no second active run" is this
      // service's job to hold.
      const active = await tx.payrollRun.findFirst({
        where: {
          organizationId: context.organizationId,
          periodStart: original.periodStart,
          periodEnd: original.periodEnd,
          status: {
            in: [PayrollRunStatus.DRAFT, PayrollRunStatus.CALCULATED, PayrollRunStatus.APPROVED],
          },
        },
      });
      if (active)
        throw new ConflictError(
          'A payroll run for this period is already open; finish or void it before correcting',
        );

      const superseded = await tx.payrollRun.update({
        where: { id: original.id },
        data: { status: PayrollRunStatus.CORRECTED, version: { increment: 1 } },
      });

      const replacement = await tx.payrollRun.create({
        data: {
          organizationId: context.organizationId,
          periodStart: original.periodStart,
          periodEnd: original.periodEnd,
          payFrequency: original.payFrequency,
          currencyCode: original.currencyCode,
          approvalPolicyId: original.approvalPolicyId,
          status: PayrollRunStatus.DRAFT,
          calculationVersion: original.calculationVersion,
          inputSnapshotHash: original.inputSnapshotHash,
          correctionOfRunId: original.id,
          createdByUserId: context.actor.userId,
        },
      });

      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RUN',
          entityId: original.id,
          action: 'PAYROLL_RUN_CORRECTED',
          beforeState: jsonSnapshot(original),
          afterState: jsonSnapshot({ superseded, replacementRunId: replacement.id }),
          reason,
        },
        tx,
      );
      return { superseded, replacement };
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
      if (run.calculationStaleAt)
        throw new ConflictError(
          'Payroll inputs changed after this run was calculated; calculate it again before approving or releasing it',
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
      compensation: {
        baseAmount: Prisma.Decimal;
        grossSalary: Prisma.Decimal | null;
        overtimeMultiplier: Prisma.Decimal;
      } | null;
      employeePolicy: {
        payrollEnabled: boolean;
        pfEnabled: boolean;
        esiEnabled: boolean;
        ptEnabled: boolean;
        statutoryJurisdiction: string | null;
      } | null;
      policy: {
        payrollDayBasis: number;
        basePercentage: Prisma.Decimal;
        baseMinimum: Prisma.Decimal;
        hraPercentage: Prisma.Decimal;
        roundingMode: 'HALF_UP' | 'DOWN' | 'UP';
        pfDefault: boolean;
        esiDefault: boolean;
        ptDefault: boolean;
        statutoryJurisdiction: string | null;
      };
      statutoryRules: Array<{
        schemeCode: string;
        employeeRate: Prisma.Decimal | null;
        employerRate: Prisma.Decimal | null;
        wageCeiling: Prisma.Decimal | null;
        employeeThreshold: Prisma.Decimal | null;
        flatAmount: Prisma.Decimal | null;
        metadata: unknown;
      }>;
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
      attendance: { absentDays: number; halfDays: number };
      unemployedDays: number;
      periodWorkingDays: number;
      adjustments: Array<{
        type: PayrollAdjustmentType;
        amount: Prisma.Decimal;
        description: string;
      }>;
      advances: Array<{
        id: string;
        approvedAmount: Prisma.Decimal | null;
        recoveredAmount: Prisma.Decimal;
      }>;
    },
    standardDayMinutes: number,
  ) {
    const grossSalary =
      item.compensation?.grossSalary ?? item.compensation?.baseAmount ?? new Prisma.Decimal(0);
    const monthlyStructure = calculateSalaryStructure(grossSalary, {
      basePercentage: item.policy.basePercentage,
      baseMinimum: item.policy.baseMinimum,
      hraPercentage: item.policy.hraPercentage,
      roundingMode: item.policy.roundingMode,
    });
    const unpaidAttendanceDays = item.attendance.absentDays + item.attendance.halfDays / 2;
    // `payrollDayBasis` is a fixed monthly divisor, so every unpaid day — leave, absence, or a day
    // outside employment — costs one basis-day of gross.
    const payableDays = Math.max(
      0,
      item.policy.payrollDayBasis -
        item.leave.unpaidDays -
        unpaidAttendanceDays -
        item.unemployedDays,
    );
    const proratedStructure = prorateSalaryStructure(
      monthlyStructure,
      payableDays,
      item.policy.payrollDayBasis,
      item.policy.roundingMode,
    );
    const unpaidLeaveAdjustment = monthlyStructure.gross.minus(proratedStructure.gross);
    const regular = proratedStructure.base;
    const overtime =
      item.compensation && item.timesheet
        ? monthlyStructure.gross
            .div(standardDayMinutes * item.policy.payrollDayBasis)
            .mul(item.timesheet.overtimeMinutes)
            .mul(item.compensation.overtimeMultiplier)
        : new Prisma.Decimal(0);
    const calculatedComponents = item.components
      .slice()
      .sort(
        (a, b) =>
          a.component.displayOrder - b.component.displayOrder ||
          a.component.code.localeCompare(b.component.code),
      )
      .map((assignment) => ({
        assignment,
        amount: ['BASE', 'BASIC'].includes(assignment.component.code)
          ? proratedStructure.base
          : assignment.component.code === 'HRA'
            ? proratedStructure.hra
            : assignment.component.code === 'OTHER_ALLOWANCE'
              ? proratedStructure.otherAllowance
              : calculateComponent(assignment, proratedStructure.base),
      }));
    const earningAdjustmentTotal = item.adjustments
      .filter((adjustment) => ['BONUS', 'REIMBURSEMENT', 'OVERTIME'].includes(adjustment.type))
      .reduce((sum, adjustment) => sum.add(adjustment.amount), new Prisma.Decimal(0));
    const deductionAdjustmentTotal = item.adjustments
      .filter((adjustment) => ['DEDUCTION', 'TAX', 'OTHER'].includes(adjustment.type))
      .reduce((sum, adjustment) => sum.add(adjustment.amount), new Prisma.Decimal(0));
    const extraEarnings = calculatedComponents
      .filter(({ assignment }) => assignment.component.componentType === PayComponentType.EARNING)
      .filter(
        ({ assignment }) =>
          !['BASE', 'BASIC', 'HRA', 'OTHER_ALLOWANCE'].includes(assignment.component.code),
      )
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    if (extraEarnings.greaterThan(proratedStructure.otherAllowance))
      throw new ConflictError(
        `Assigned earning components exceed the available other allowance for employee ${item.employeeId}`,
      );
    const components = calculatedComponents.map((entry) =>
      entry.assignment.component.code === 'OTHER_ALLOWANCE'
        ? { ...entry, amount: proratedStructure.otherAllowance.sub(extraEarnings) }
        : entry,
    );
    const gross = proratedStructure.gross.add(overtime).add(earningAdjustmentTotal);
    const componentDeduction = components
      .filter(({ assignment }) => assignment.component.componentType === PayComponentType.DEDUCTION)
      .reduce((sum, entry) => sum.add(entry.amount), new Prisma.Decimal(0));
    const enabled = {
      pf: item.employeePolicy?.pfEnabled ?? item.policy.pfDefault,
      esi: item.employeePolicy?.esiEnabled ?? item.policy.esiDefault,
      pt: item.employeePolicy?.ptEnabled ?? item.policy.ptDefault,
    };
    const statutory = item.statutoryRules
      .filter((rule) => {
        const code = rule.schemeCode.toUpperCase();
        return (
          (enabled.pf && ['PF', 'EPF'].includes(code)) ||
          (enabled.esi && code === 'ESIC') ||
          (enabled.pt && ['PT', 'PROFESSIONAL_TAX'].includes(code))
        );
      })
      .map((rule) =>
        calculateStatutoryDeduction(
          proratedStructure,
          rule,
          item.policy.roundingMode,
          monthlyStructure,
        ),
      );
    const statutoryDeduction = statutory.reduce(
      (sum, entry) => sum.add(entry.employeeAmount),
      new Prisma.Decimal(0),
    );
    const beforeAdvanceDeductions = componentDeduction
      .add(deductionAdjustmentTotal)
      .add(statutoryDeduction);
    let availableNetPay = gross.sub(beforeAdvanceDeductions);
    const advanceRecoveries = item.advances.map((advance) => {
      const amount = allocateAdvanceRecovery(
        advance.approvedAmount ?? 0,
        advance.recoveredAmount,
        availableNetPay,
      );
      availableNetPay = availableNetPay.sub(amount);
      return { advance, amount };
    });
    const advanceRecoveryTotal = advanceRecoveries.reduce(
      (sum, adjustment) => sum.add(adjustment.amount),
      new Prisma.Decimal(0),
    );
    const deduction = beforeAdvanceDeductions.add(advanceRecoveryTotal);
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
        leaveAmount: unpaidLeaveAdjustment,
        inputSnapshot: jsonSnapshot(item),
        calculationBreakdown: jsonSnapshot({
          base: monthlyStructure.base,
          regular,
          overtime,
          earningAdjustmentTotal,
          deductionAdjustmentTotal,
          monthlyStructure,
          proratedStructure,
          statutory,
          advanceRecoveries,
          advanceRecoveryTotal,
          unpaidLeaveAdjustment,
          paidLeaveDays: item.leave.paidDays,
          unpaidLeaveDays: item.leave.unpaidDays,
          absentAttendanceDays: item.attendance.absentDays,
          halfAttendanceDays: item.attendance.halfDays,
          unpaidAttendanceDays,
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
    for (const recovery of advanceRecoveries) {
      if (!recovery.amount.greaterThan(0)) continue;
      await tx.salaryAdvanceRecovery.create({
        data: {
          organizationId,
          salaryAdvanceId: recovery.advance.id,
          payrollRunId,
          employeeId: item.employeeId,
          amount: recovery.amount,
        },
      });
      const recovered = recovery.advance.recoveredAmount.add(recovery.amount);
      const approved = recovery.advance.approvedAmount ?? new Prisma.Decimal(0);
      await tx.salaryAdvance.update({
        where: { id: recovery.advance.id },
        data: {
          recoveredAmount: recovered,
          status: recovered.greaterThanOrEqualTo(approved) ? 'RECOVERED' : 'PARTIALLY_RECOVERED',
        },
      });
    }
    await tx.payrollPayment.create({
      data: {
        organizationId,
        payrollRunId,
        payrollLineItemId: line.id,
        employeeId: item.employeeId,
        amount: net,
        status: 'PENDING',
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

  private employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
    return context.branchId
      ? {
          OR: [
            { primaryBranchId: context.branchId },
            { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
          ],
        }
      : {};
  }
}

function detailedSalarySlipAllowed(snapshot: Prisma.JsonValue) {
  if (!isRecord(snapshot)) return true;
  const employeePolicy = isRecord(snapshot.employeePolicy) ? snapshot.employeePolicy : null;
  if (employeePolicy?.salarySlipMode === 'DISABLED') return false;
  const policy = isRecord(snapshot.policy) ? snapshot.policy : null;
  return policy?.salarySlipDefault !== false;
}

function endOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

function mergeSalaryComponents(
  components: Array<{
    componentCode: string;
    componentName: string;
    componentType: string;
    amount: Prisma.Decimal;
  }>,
  breakdown: Prisma.JsonValue,
) {
  const existingCodes = new Set(
    components.map((component) => component.componentCode.toUpperCase()),
  );
  const structure =
    isRecord(breakdown) && isRecord(breakdown.proratedStructure)
      ? breakdown.proratedStructure
      : null;
  const extraEarnings = components
    .filter((component) => component.componentType === 'EARNING')
    .filter(
      (component) =>
        !['BASE', 'BASIC', 'HRA', 'OTHER_ALLOWANCE'].includes(
          component.componentCode.toUpperCase(),
        ),
    )
    .reduce((sum, component) => sum.add(component.amount), new Prisma.Decimal(0));
  const computedCandidates: Array<[string, string, Prisma.Decimal]> = structure
    ? [
        ['BASE', 'Base salary', decimalFromUnknown(structure.base)],
        ['HRA', 'HRA', decimalFromUnknown(structure.hra)],
        [
          'OTHER_ALLOWANCE',
          'Other allowance',
          decimalFromUnknown(structure.otherAllowance).sub(extraEarnings),
        ],
      ]
    : [];
  const computed = computedCandidates
    .filter(([code]) => !existingCodes.has(code.toUpperCase()))
    .map(([code, name, amount]) => ({
      componentCode: code,
      componentName: name,
      componentType: 'EARNING',
      amount,
    }));
  const statutory =
    isRecord(breakdown) && Array.isArray(breakdown.statutory)
      ? breakdown.statutory
          .map((entry) => {
            if (!isRecord(entry) || typeof entry.schemeCode !== 'string') return null;
            const code = entry.schemeCode.toUpperCase();
            if (existingCodes.has(code)) return null;
            const name =
              code === 'EPF' || code === 'PF'
                ? 'EPF'
                : code === 'ESIC'
                  ? 'ESI'
                  : code === 'PT' || code === 'PROFESSIONAL_TAX'
                    ? 'Professional tax'
                    : code;
            return {
              componentCode: code,
              componentName: name,
              componentType: 'DEDUCTION',
              amount: decimalFromUnknown(entry.employeeAmount),
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [];
  return [...components, ...computed, ...statutory];
}

function decimalFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Prisma.Decimal(value);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return new Prisma.Decimal(value);
  }
  return new Prisma.Decimal(0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateCalendarMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new ConflictError('Payroll calendar year is invalid');
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new ConflictError('Payroll calendar month is invalid');
}

function isSupportedFormula(
  value: unknown,
): value is { operation: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { operation?: unknown; value?: unknown };
  return (
    (candidate.operation === 'FIXED' || candidate.operation === 'PERCENTAGE_OF_BASE') &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    candidate.value >= 0 &&
    (candidate.operation === 'PERCENTAGE_OF_BASE' ? candidate.value <= 100 : true)
  );
}

function validateComponentInput(input: ComponentInput) {
  if (!input.code.trim() || !input.name.trim())
    throw new ConflictError('Pay component code and name are required');
  if (input.formulaDefinition !== undefined && !isSupportedFormula(input.formulaDefinition))
    throw new ConflictError('Pay component values require a supported formula definition');
  if (
    input.formulaDefinition !== undefined &&
    input.calculationType !== PayComponentCalculationType.FORMULA &&
    !matchesCalculationType(input.calculationType, input.formulaDefinition)
  )
    throw new ConflictError('Pay component value does not match its calculation type');
  if (
    input.calculationType === PayComponentCalculationType.FORMULA &&
    input.formulaDefinition === undefined
  )
    throw new ConflictError('Formula pay components require a supported formula definition');
}

function matchesCalculationType(
  calculationType: PayComponentCalculationType,
  formula: { operation: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: number },
) {
  return (
    (calculationType === PayComponentCalculationType.FIXED && formula.operation === 'FIXED') ||
    (calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE &&
      formula.operation === 'PERCENTAGE_OF_BASE')
  );
}

function hasDefaultValue(value: unknown, operation: 'FIXED' | 'PERCENTAGE_OF_BASE') {
  return isSupportedFormula(value) && value.operation === operation;
}

function encodePayrollCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

function decodePayrollCursor(cursor: string) {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !value.id
    ) {
      throw new Error('invalid');
    }
    return value.id;
  } catch {
    throw new ConflictError('Payroll ledger cursor is invalid or expired');
  }
}
