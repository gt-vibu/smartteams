import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SalarySlipMode } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import {
  allocateAdvanceRecovery,
  calculateSalaryStructure,
  calculateStatutoryDeduction,
  prorateSalaryStructure,
} from './payroll-salary-structure';
import { summarizeAttendance, summarizeLeave, unemployedDays } from './payroll-calculation';
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
      const elapsedDays =
        measuredEnd < periodStart
          ? 0
          : Math.floor((measuredEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
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
      // Preview measures the period only as far as today, which is why its figure differs from a
      // released run. The *day accounting* must not differ though, so employment dates are counted
      // here exactly as `calculate` counts them.
      const notEmployedDays = unemployedDays(
        periodStart,
        measuredEnd,
        employee.dateOfJoining,
        employee.dateOfLeaving,
      );
      const payableDays =
        input.payableDays ??
        Math.max(
          0,
          Math.min(policy.payrollDayBasis, elapsedDays) -
            leave.unpaidDays -
            attendance.absentDays -
            attendance.halfDays / 2 -
            notEmployedDays,
        );
      if (!Number.isFinite(payableDays) || payableDays < 0 || payableDays > policy.payrollDayBasis)
        throw new ConflictError('Preview payable days must be within the payroll day basis');
      const structure = prorateSalaryStructure(
        monthlyStructure,
        payableDays,
        policy.payrollDayBasis,
        policy.roundingMode,
      );
      const jurisdiction = employeePolicy?.statutoryJurisdiction ?? policy.statutoryJurisdiction;
      const advanceCutoff = endOfDay(periodEnd);
      const [rules, advances] = await Promise.all([
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
      ]);
      const enabled = {
        pf: employeePolicy?.pfEnabled ?? policy.pfDefault,
        esi: employeePolicy?.esiEnabled ?? policy.esiDefault,
        pt: employeePolicy?.ptEnabled ?? policy.ptDefault,
      };
      const statutory = rules
        .filter(
          (rule) =>
            (enabled.pf && ['PF', 'EPF'].includes(rule.schemeCode.toUpperCase())) ||
            (enabled.esi && rule.schemeCode.toUpperCase() === 'ESIC') ||
            (enabled.pt && ['PT', 'PROFESSIONAL_TAX'].includes(rule.schemeCode.toUpperCase())),
        )
        .map((rule) =>
          calculateStatutoryDeduction(structure, rule, policy.roundingMode, monthlyStructure),
        );
      const deductions = statutory.reduce(
        (sum, item) => sum.plus(item.employeeAmount),
        new Prisma.Decimal(0),
      );
      let availableNetPay = structure.gross.minus(deductions);
      const advanceRecoveries = advances.map((advance) => {
        const amount = allocateAdvanceRecovery(
          advance.approvedAmount ?? 0,
          advance.recoveredAmount,
          availableNetPay,
        );
        availableNetPay = availableNetPay.minus(amount);
        return { advanceId: advance.id, amount };
      });
      const advanceRecovery = advanceRecoveries.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
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
        net: availableNetPay,
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
