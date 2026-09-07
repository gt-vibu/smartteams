import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type {
  PayComponentCalculationType,
  PayrollAdjustmentType,
} from '../../generated/prisma/enums';
import { PayComponentType } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';
import { jsonSnapshot } from '../audit/audit.service';
import { calculateComponent } from './payroll-calculation';
import {
  allocateAdvanceRecovery,
  calculateSalaryStructure,
  calculateStatutoryDeduction,
  prorateSalaryStructure,
} from './payroll-salary-structure';

/**
 * How one employee's pay for one run is worked out, and how the resulting payslip rows appear.
 *
 * Lifted out of `PayrollService` unchanged. It was the largest single thing in a 1539-line file
 * and it never touched the service's own dependencies — no database handle of its own, no audit
 * writer, no outbox — so it was already a function wearing a method's clothes. Written as one
 * here, it can be read, and eventually tested, without standing a service up first.
 */

/**
 * Everything one employee's pay for one period is computed from.
 *
 * Named because two callers now assemble it: the payroll run, which persists the result, and the
 * preview, which does not. They must gather the same inputs or the number an administrator is
 * shown is not the number that will be paid.
 */
export type PayrollLineInput = {
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
};

/**
 * The payroll engine: inputs in, money out, nothing written.
 *
 * Split out of `calculateLine` so the preview can run the real calculation instead of its own
 * parallel arithmetic. The preview used to re-implement proration, statutory deduction and
 * advance recovery inline, and had quietly drifted — it read neither timesheets, nor holidays,
 * nor adjustments, nor pay components, so a previewed figure could differ from the released one
 * with nothing on screen to say why.
 */
export function computePayrollLine(item: PayrollLineInput, standardDayMinutes: number) {
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
  return {
    monthlyStructure,
    proratedStructure,
    payableDays,
    unpaidAttendanceDays,
    regular,
    overtime,
    components,
    componentDeduction,
    earningAdjustmentTotal,
    deductionAdjustmentTotal,
    unpaidLeaveAdjustment,
    statutory,
    statutoryDeduction,
    advanceRecoveries,
    advanceRecoveryTotal,
    gross,
    deduction,
    net,
  };
}

/**
 * The database rows one employee's calculated pay becomes.
 *
 * Returned rather than written, so the caller can insert a whole run set-based. `calculateLine`
 * used to do both: compute, then issue a `create` for the line, a `create` for the payment and a
 * create/update pair per advance recovery — two to four round trips per employee, run
 * sequentially inside the write transaction. That is the same shape `createPayslips` below was
 * already rewritten away from, for the same reason.
 *
 * The arithmetic is untouched: this calls `computePayrollLine` and only shapes its output.
 */
export type PayrollLineRows = {
  line: Prisma.PayrollLineItemCreateManyInput;
  components: Prisma.PayrollLineItemComponentCreateManyInput[];
  payment: Prisma.PayrollPaymentCreateManyInput;
  recoveries: Prisma.SalaryAdvanceRecoveryCreateManyInput[];
  /** Final state per advance this line recovered against; the caller applies one update each. */
  advanceUpdates: Array<{
    id: string;
    recoveredAmount: Prisma.Decimal;
    status: 'RECOVERED' | 'PARTIALLY_RECOVERED';
  }>;
  result: {
    employeeId: string;
    grossAmount: Prisma.Decimal;
    deductionAmount: Prisma.Decimal;
    netAmount: Prisma.Decimal;
    components: Array<{ code: string; amount: Prisma.Decimal }>;
    lineId: string;
  };
};

export function buildPayrollLineRows(
  organizationId: string,
  payrollRunId: string,
  item: PayrollLineInput,
  standardDayMinutes: number,
  lineId: string = randomUUID(),
): PayrollLineRows {
  const {
    monthlyStructure,
    proratedStructure,
    unpaidAttendanceDays,
    regular,
    overtime,
    components,
    earningAdjustmentTotal,
    deductionAdjustmentTotal,
    unpaidLeaveAdjustment,
    statutory,
    advanceRecoveries,
    advanceRecoveryTotal,
    gross,
    deduction,
    net,
  } = computePayrollLine(item, standardDayMinutes);

  const recoveries: Prisma.SalaryAdvanceRecoveryCreateManyInput[] = [];
  const advanceUpdates: PayrollLineRows['advanceUpdates'] = [];
  for (const recovery of advanceRecoveries) {
    if (!recovery.amount.greaterThan(0)) continue;
    recoveries.push({
      organizationId,
      salaryAdvanceId: recovery.advance.id,
      payrollRunId,
      employeeId: item.employeeId,
      amount: recovery.amount,
    });
    const recovered = recovery.advance.recoveredAmount.add(recovery.amount);
    const approved = recovery.advance.approvedAmount ?? new Prisma.Decimal(0);
    advanceUpdates.push({
      id: recovery.advance.id,
      recoveredAmount: recovered,
      status: recovered.greaterThanOrEqualTo(approved) ? 'RECOVERED' : 'PARTIALLY_RECOVERED',
    });
  }

  return {
    line: {
      id: lineId,
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
    },
    components: components.map(({ assignment, amount }) => ({
      organizationId,
      payrollLineItemId: lineId,
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
    payment: {
      organizationId,
      payrollRunId,
      payrollLineItemId: lineId,
      employeeId: item.employeeId,
      amount: net,
      status: 'PENDING',
    },
    recoveries,
    advanceUpdates,
    result: {
      employeeId: item.employeeId,
      grossAmount: gross,
      deductionAmount: deduction,
      netAmount: net,
      components: components.map(({ assignment, amount }) => ({
        code: assignment.component.code,
        amount,
      })),
      lineId,
    },
  };
}

/**
 * Materialises a payslip per calculated line.
 *
 * Replayable: advancing a run may be attempted twice and must not leave two payslips for one
 * line. That used to be expressed as an `upsert` per line inside the transaction, which is one
 * database round trip per employee — fine for the ten-person tenant it was written against, and
 * five thousand sequential round trips holding a write transaction open for a payroll of five
 * thousand. Two set-based statements do the same work in constant round trips:
 *
 *   - `createMany` with `skipDuplicates` inserts the payslips that do not exist yet, which is
 *     exactly what the `create` branch did, `status` included.
 *   - `updateMany` stamps `issuedAt` across the run, which is what the `update` branch did.
 *
 * The set the second statement touches is the same one the loop touched: a payslip belongs to
 * exactly one run, so scoping by `payrollRunId` selects the rows the line items point at and no
 * others. Only the two columns needed are read back, rather than whole line items.
 */
export async function createPayslips(
  tx: Prisma.TransactionClient,
  organizationId: string,
  payrollRunId: string,
) {
  const lines = await tx.payrollLineItem.findMany({
    where: { organizationId, payrollRunId },
    select: { id: true, employeeId: true },
  });
  if (lines.length === 0) return;
  const issuedAt = new Date();
  await tx.payslip.createMany({
    data: lines.map((line) => ({
      organizationId,
      payrollRunId,
      payrollLineItemId: line.id,
      employeeId: line.employeeId,
      status: 'PENDING_UPLOAD' as const,
      issuedAt,
    })),
    skipDuplicates: true,
  });
  await tx.payslip.updateMany({
    where: { organizationId, payrollRunId },
    data: { issuedAt },
  });
}
