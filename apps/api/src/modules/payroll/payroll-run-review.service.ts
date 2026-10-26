import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

type Stored = {
  regular?: unknown;
  overtime?: unknown;
  earningAdjustmentTotal?: unknown;
  deductionAdjustmentTotal?: unknown;
  advanceRecoveryTotal?: unknown;
  unpaidLeaveAdjustment?: unknown;
  statutory?: Array<{ schemeCode?: string; employeeAmount?: unknown; eligible?: boolean }>;
  paidLeaveDays?: unknown;
  unpaidLeaveDays?: unknown;
  unpaidAttendanceDays?: unknown;
  unemployedDays?: unknown;
  periodWorkingDays?: unknown;
  componentDeduction?: unknown;
};

/** The calculation's own record of a line, in the terms a reviewer checks. */
function breakdownOf(value: unknown) {
  const stored = (value ?? {}) as Stored;
  return {
    regularPay: money(stored.regular),
    overtimePay: money(stored.overtime),
    additions: money(stored.earningAdjustmentTotal),
    otherDeductions: money(stored.deductionAdjustmentTotal),
    advanceRecovery: money(stored.advanceRecoveryTotal),
    unpaidLeaveDeduction: money(stored.unpaidLeaveAdjustment),
    componentDeductionsTotal: money(stored.componentDeduction),
    statutory: (stored.statutory ?? [])
      .filter((entry) => entry.eligible)
      .map((entry) => ({ scheme: String(entry.schemeCode), amount: money(entry.employeeAmount) })),
    workingDays: Number(stored.periodWorkingDays ?? 0),
    paidLeaveDays: Number(stored.paidLeaveDays ?? 0),
    unpaidDays:
      Number(stored.unpaidLeaveDays ?? 0) +
      Number(stored.unpaidAttendanceDays ?? 0) +
      Number(stored.unemployedDays ?? 0),
  };
}

/**
 * A calculated run's figures, person by person, before anyone approves it.
 *
 * Payslips exist only once a run is released, so without this an approver signed off on a run
 * without seeing a single amount. The figures are the run's own line items — what approval and
 * release will pay — and reading them needs the right to see everyone's pay.
 */
@Injectable()
export class PayrollRunReviewService {
  constructor(private readonly database: TenantDatabaseService) {}

  async review(context: DomainContext, runId: string) {
    requirePermission(context, 'payroll.runs.read');
    if (!context.permissions.has('*') && !context.permissions.has('payroll.payslips.read.all'))
      throw new ForbiddenDomainError(
        'Reviewing a run needs permission to read every employee’s pay',
      );
    return this.database.run(context, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: context.organizationId },
        select: { id: true, status: true },
      });
      if (!run) throw new NotFoundError('Payroll run not found');
      const [lines, employees] = await Promise.all([
        tx.payrollLineItem.findMany({
          where: { organizationId: context.organizationId, payrollRunId: run.id },
          select: {
            employeeId: true,
            grossAmount: true,
            deductionAmount: true,
            netAmount: true,
            calculationBreakdown: true,
            components: {
              where: { componentType: 'DEDUCTION' },
              select: { componentCode: true, componentName: true, amount: true },
              orderBy: { displayOrder: 'asc' },
            },
            employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
          },
          orderBy: { employee: { employeeNumber: 'asc' } },
        }),
        tx.employee.findMany({
          where: { organizationId: context.organizationId, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          orderBy: { employeeNumber: 'asc' },
        }),
      ]);
      const lineByEmployee = new Map(lines.map((line) => [line.employeeId, line]));
      const items = employees.map((employee) => {
        const line = lineByEmployee.get(employee.id);
        return {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          name: `${employee.firstName} ${employee.lastName}`.trim(),
          hasPayrollLine: Boolean(line),
          gross: money(line?.grossAmount),
          deductions: money(line?.deductionAmount),
          net: money(line?.netAmount),
          breakdown: {
            ...breakdownOf(line?.calculationBreakdown),
            componentDeductions: (line?.components ?? []).map((component) => ({
              code: component.componentCode,
              name: component.componentName,
              amount: money(component.amount),
            })),
          },
        };
      });
      const total = (key: 'gross' | 'deductions' | 'net') =>
        money(items.reduce((sum, item) => sum + item[key], 0));
      return {
        runId: run.id,
        status: run.status,
        activeEmployeeCount: employees.length,
        items,
        totals: { gross: total('gross'), deductions: total('deductions'), net: total('net') },
      };
    });
  }
}
