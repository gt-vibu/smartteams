import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SalarySlipMode } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { calculateSalaryStructure } from './payroll-salary-structure';
import {
  countWorkingDays,
  summarizeAttendance,
  summarizeLeave,
  sumTimesheets,
  unemployedDays,
} from './payroll-calculation';
import { computePayrollLine } from './payroll-line-calculator';
import { TimesheetStatus } from '../../generated/prisma/enums';
import { dateOnly, type PreviewInput } from './payroll-policy.types';
import { employeeScope, findPolicy, resolveEmployeeId } from './payroll-policy-access';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';

@Injectable()
export class PayrollPreviewService {
  constructor(private readonly database: TenantDatabaseService) {}

  async preview(context: DomainContext, input: PreviewInput) {
    requirePermission(context, 'payroll.preview.read');
    return this.database.run(context, async (tx) => {
      const periodStart = dateOnly(input.periodStart);
      const periodEnd = dateOnly(input.periodEnd);
      if (periodEnd < periodStart)
        throw new ConflictError('Preview period end must be after start');
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        input.employeeId,
        false,
        'payroll.employee-profile.read.all',
      );
      if (!employeeId) throw new NotFoundError('Employee');
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          organizationId: context.organizationId,
          ...employeeScope(context),
        },
        include: {
          compensations: {
            where: {
              effectiveFrom: { lte: periodEnd },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          payrollPolicies: {
            where: {
              effectiveFrom: { lte: periodEnd },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          // Assembled exactly as the run assembles them: they are part of the pay.
          payComponents: {
            where: {
              effectiveFrom: { lte: periodEnd },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
            },
            include: { payComponent: true },
            orderBy: { effectiveFrom: 'desc' },
          },
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      const policy =
        (await findPolicy(tx, context.organizationId, periodStart)) ?? DEFAULT_PAYROLL_POLICY;
      const compensation = employee.compensations[0];
      if (!compensation) throw new ConflictError('Employee has no salary profile for this period');
      const employeePolicy = employee.payrollPolicies[0];
      const gross = compensation.grossSalary ?? compensation.baseAmount;
      const monthlyStructure = calculateSalaryStructure(gross, policy);
      const today = dateOnly(new Date().toISOString());
      const measuredEnd = today < periodEnd ? today : periodEnd;
      const [settings, holidays, employeeHolidaySelections, approvedTimesheets] = await Promise.all(
        [
          tx.organizationSettings.findUniqueOrThrow({
            where: { organizationId: context.organizationId },
          }),
          // Holidays and timesheets are read here because the run reads them. The preview used to
          // skip both, so a previewed figure could differ from the released one for reasons an
          // administrator had no way to see.
          tx.holiday.findMany({
            where: {
              organizationId: context.organizationId,
              isActive: true,
              holidayDate: { gte: periodStart, lte: periodEnd },
            },
            select: { holidayDate: true, branchId: true, isOptional: true },
          }),
          tx.employeeHolidaySelection.findMany({
            where: {
              organizationId: context.organizationId,
              employeeId,
              status: 'CONFIRMED',
              holiday: {
                isActive: true,
                isOptional: true,
                holidayDate: { gte: periodStart, lte: periodEnd },
              },
            },
            select: {
              holiday: { select: { holidayDate: true } },
            },
          }),
          tx.timesheet.findMany({
            where: {
              organizationId: context.organizationId,
              employeeId,
              status: TimesheetStatus.APPROVED,
              period: { periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
            },
          }),
        ],
      );
      const [attendanceRecords, approvedLeaves] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId,
            workDate: { gte: periodStart, lte: measuredEnd },
          },
          select: { dayStatus: true },
        }),
        tx.leaveRequest.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId,
            status: 'APPROVED',
            startDate: { lte: measuredEnd },
            endDate: { gte: periodStart },
          },
          select: {
            startDate: true,
            endDate: true,
            requestedDays: true,
            leaveType: { select: { paid: true } },
          },
        }),
      ]);
      const attendance = summarizeAttendance(attendanceRecords);
      const leave = summarizeLeave(approvedLeaves, periodStart, measuredEnd);
      // Preview measures the period only as far as today. That is the ONE deliberate difference
      // from a released run, and it is the reason a mid-month preview is smaller than the final
      // figure — every other input below is now read exactly as `calculate` reads it.
      const notEmployedDays = unemployedDays(
        periodStart,
        measuredEnd,
        employee.dateOfJoining,
        employee.dateOfLeaving,
      );

      const jurisdiction = employeePolicy?.statutoryJurisdiction ?? policy.statutoryJurisdiction;
      const advanceCutoff = endOfDay(periodEnd);
      const [rules, advances, adjustments] = await Promise.all([
        jurisdiction
          ? tx.payrollStatutoryRule.findMany({
              where: {
                organizationId: context.organizationId,
                jurisdiction,
                effectiveFrom: { lte: periodEnd },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
              },
              orderBy: { effectiveFrom: 'desc' },
            })
          : [],
        tx.salaryAdvance.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId,
            status: { in: ['APPROVED', 'PARTIALLY_RECOVERED'] },
            approvedAt: { not: null, lte: advanceCutoff },
          },
          orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        }),
        // Adjustments belong to a run, so a preview has none to read. Stated rather than omitted:
        // this is the one input a preview genuinely cannot have, because the run it would belong
        // to does not exist yet.
        Promise.resolve([] as Array<never>),
      ]);

      // The same shape the run assembles, fed to the same engine. The policy's ratios are
      // normalised to `Decimal` because `DEFAULT_PAYROLL_POLICY` states them as plain numbers,
      // and the engine's contract is the database's type rather than the fallback's.
      const enginePolicy = {
        ...policy,
        basePercentage: new Prisma.Decimal(policy.basePercentage),
        baseMinimum: new Prisma.Decimal(policy.baseMinimum),
        hraPercentage: new Prisma.Decimal(policy.hraPercentage),
      };
      const item = {
        employeeId,
        compensation,
        employeePolicy: employeePolicy ?? null,
        policy: enginePolicy,
        statutoryRules: rules,
        components: employee.payComponents.map((assignment) => ({
          componentId: assignment.payComponentId,
          amount: assignment.amount,
          percentage: assignment.percentage,
          component: assignment.payComponent,
        })),
        timesheet: sumTimesheets(approvedTimesheets),
        leave,
        attendance,
        unemployedDays: notEmployedDays,
        periodWorkingDays: countWorkingDays(
          periodStart,
          measuredEnd,
          settings.workWeekDays,
          holidays,
          employee.primaryBranchId,
          employeeHolidaySelections.map((s) => s.holiday.holidayDate.toISOString().slice(0, 10)),
        ),
        adjustments,
        advances,
      };

      const computed = computePayrollLine(item, settings.standardDayMinutes);

      // `payableDays` may be overridden by the caller, which is a preview-only affordance for
      // modelling "what if this many days were payable". It replaces the computed figure rather
      // than sitting alongside it, so the number shown is always the one the maths used.
      const payableDays = input.payableDays ?? computed.payableDays;
      if (!Number.isFinite(payableDays) || payableDays < 0 || payableDays > policy.payrollDayBasis)
        throw new ConflictError('Preview payable days must be within the payroll day basis');
      const overridden =
        input.payableDays === undefined
          ? computed
          : computePayrollLine(
              {
                ...item,
                leave: { paidDays: leave.paidDays, unpaidDays: 0 },
                attendance: { absentDays: 0, halfDays: 0 },
                unemployedDays: policy.payrollDayBasis - input.payableDays,
              },
              settings.standardDayMinutes,
            );

      const structure = overridden.proratedStructure;
      const statutory = overridden.statutory;
      const deductions = overridden.statutoryDeduction;
      const advanceRecoveries = overridden.advanceRecoveries.map((entry) => ({
        advanceId: entry.advance.id,
        amount: entry.amount,
      }));
      const advanceRecovery = overridden.advanceRecoveryTotal;

      return {
        employeeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        payableDays,
        dayBasis: policy.payrollDayBasis,
        monthlyStructure,
        structure,
        statutory,
        deductions,
        advances: advanceRecoveries,
        advanceRecovery,
        attendance,
        leave,
        gross: overridden.gross,
        deduction: overridden.deduction,
        net: overridden.net,
        employeePolicy,
        salarySlipMode:
          employeePolicy?.salarySlipMode ??
          (policy.salarySlipDefault ? SalarySlipMode.ENABLED : SalarySlipMode.DISABLED),
      };
    });
  }
}

function endOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}
