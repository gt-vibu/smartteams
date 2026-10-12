import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { MetricsService } from '../../common/metrics/metrics.service';
import { Prisma } from '../../generated/prisma/client';
import {
  PayrollRoundingMode,
  PayrollRunStatus,
  TimesheetStatus,
} from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { lateHalfDays, lateMarks } from '../attendance/attendance-late';
import { unmarkedDaysAreAbsent } from '../attendance/attendance-work-week.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { readAdvanceRules, recoveryInstalment } from './payroll-advance-rules';
import { chunked, groupBy } from './payroll-bulk';
import {
  countWorkingDays,
  hash,
  summarizeAttendance,
  summarizeLeave,
  sumTimesheets,
  unemployedDays,
} from './payroll-calculation';
import { loadPayrollCalculationInputs } from './payroll-calculation-inputs';
import { attachApprovedEncashments } from './payroll-encashments';
import { buildPayrollLineRows } from './payroll-line-calculator';
import { withNationalStatutoryRules } from './payroll-national-statutory';
import { readOvertimeRates } from './payroll-overtime-rates';
import { sumOvertimeByDayType } from './payroll-overtime-split';
import { findPolicy } from './payroll-policy-access';
import { endOfDay } from './payroll-shared';

/**
 * Running the calculation for a whole payroll run.
 *
 * Gathers everything one run needs — compensation, policy, attendance, leave, timesheets — and
 * hands each employee to the line calculator. The per-employee arithmetic deliberately lives in
 * `payroll-line-calculator`, so this file stays about orchestration and staleness.
 */
/**
 * Rows per `createMany`. PostgreSQL caps a statement's bind parameters at 65535; a payroll line
 * carries enough columns that an unbounded batch would breach that on a large tenant.
 */
const BULK_INSERT_BATCH = 500;

@Injectable()
export class PayrollCalculationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  async calculate(context: DomainContext, runId: string) {
    requirePermission(context, 'payroll.runs.calculate');
    const stopTimer = this.metrics.payrollDuration.startTimer();
    try {
      const result = await this.calculateInTransaction(context, runId);
      this.metrics.payrollRuns.inc({ outcome: 'succeeded' });
      return result;
    } catch (error) {
      // Distinguished from a plain failure because it is the symptom of a run outgrowing its
      // bounds rather than of bad input, and it is what an operator needs to see rising.
      const timedOut =
        error instanceof Error && /transaction.*(timeout|expired)/i.test(error.message);
      this.metrics.payrollRuns.inc({ outcome: timedOut ? 'timed_out' : 'failed' });
      throw error;
    } finally {
      stopTimer();
    }
  }

  private async calculateInTransaction(context: DomainContext, runId: string) {
    return this.database.run(
      context,
      async (tx) => {
        // Serialise concurrent calculations of the same run.
        //
        // Without the lock two callers both read the run as DRAFT, both pass the guard below, and
        // both proceed to delete and re-insert the run's line items — which races on the unique
        // constraints and surfaces as a 500 rather than a clean refusal. Taking the row lock first
        // means the second caller waits, then reads the state the first one left and is refused by
        // the guard, which is what a duplicate request should get. Same idiom as
        // `FilesUploadService.complete`.
        await tx.$queryRaw`SELECT id FROM payroll_runs WHERE id = ${runId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
        const run = await tx.payrollRun.findFirst({
          where: { id: runId, organizationId: context.organizationId },
        });
        // A calculated run is recalculable only while it is marked stale: an input changed after the
        // figures were produced, so the figures have to catch up before anyone can approve them.
        const recalculable =
          (run?.status === PayrollRunStatus.CALCULATED ||
            run?.status === PayrollRunStatus.APPROVED) &&
          run.calculationStaleAt !== null;
        if (!run || !(run.status === PayrollRunStatus.DRAFT || recalculable))
          throw new ConflictError(
            'Only a draft payroll run, or a calculated run with pending changes, can be calculated',
          );
        const unapproved = await tx.timesheet.count({
          where: {
            organizationId: context.organizationId,
            period: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart } },
            status: { not: TimesheetStatus.APPROVED },
            // An empty draft holds no work to approve, and cannot be submitted: the API refuses an
            // empty timesheet. Deriving a period creates one for everyone with nothing logged, so
            // counting it let a single idle employee block the whole company's payroll with no
            // way to clear it. Federation keeps the stricter count it was built against.
            ...(context.accessMode === 'NATIVE'
              ? { NOT: { status: TimesheetStatus.DRAFT, totalMinutes: 0 } }
              : {}),
          },
        });
        if (unapproved > 0) throw new ConflictError('Payroll can consume only approved timesheets');
        const [
          employees,
          settings,
          holidays,
          employeeHolidaySelections,
          approvedLeaves,
          attendanceRecords,
        ] = await loadPayrollCalculationInputs(tx, context, run);
        const timesheets = await tx.timesheet.findMany({
          where: {
            organizationId: context.organizationId,
            status: TimesheetStatus.APPROVED,
            period: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart } },
          },
        });
        await attachApprovedEncashments(tx, context, run);
        const adjustments = await tx.payrollAdjustment.findMany({
          where: { payrollRunId: run.id },
          orderBy: [{ employeeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        const basePolicy = await findPolicy(tx, context.organizationId, run.periodStart);
        const policy = (basePolicy
          ? await tx.payrollPolicy.findUnique({
              where: { id: basePolicy.id },
              include: { components: { include: { payComponent: true } } },
            })
          : null) ?? {
          payrollDayBasis: 30,
          basePercentage: new Prisma.Decimal(50),
          baseMinimum: new Prisma.Decimal(15000),
          hraPercentage: new Prisma.Decimal(40),
          defaultGrossSalary: null,
          roundingMode: PayrollRoundingMode.HALF_UP,
          pfDefault: false,
          esiDefault: false,
          ptDefault: false,
          statutoryJurisdiction: null,
          salarySlipDefault: true,
          payrollEnabledDefault: true,
          components: [],
        };
        const statutoryRules = await tx.payrollStatutoryRule.findMany({
            where: {
              organizationId: context.organizationId,
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
        // Before the outstanding advances are read: a recalculation found an advance this run had
        // already recovered in full, left it out, then unwound the recovery — so it was never
        // recovered at all.
        // Unwind what a previous calculation of this run recovered, so a recalculation starts from
        // the same place the first calculation did. Read the advances once by id and total the
        // reversals per advance, rather than a lookup and a write per recovery row.
        const previousRecoveries = await tx.salaryAdvanceRecovery.findMany({
          where: { payrollRunId: run.id },
          select: { salaryAdvanceId: true, amount: true },
        });
        if (previousRecoveries.length > 0) {
          const reversalByAdvance = new Map<string, Prisma.Decimal>();
          for (const recovery of previousRecoveries)
            reversalByAdvance.set(
              recovery.salaryAdvanceId,
              (reversalByAdvance.get(recovery.salaryAdvanceId) ?? new Prisma.Decimal(0)).add(
                recovery.amount,
              ),
            );
          const affected = await tx.salaryAdvance.findMany({
            where: {
              organizationId: context.organizationId,
              id: { in: [...reversalByAdvance.keys()] },
            },
            select: { id: true, recoveredAmount: true },
          });
          for (const advance of affected) {
            const recovered = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              advance.recoveredAmount.sub(
                reversalByAdvance.get(advance.id) ?? new Prisma.Decimal(0),
              ),
            );
            await tx.salaryAdvance.update({
              where: { id: advance.id },
              data: {
                recoveredAmount: recovered,
                status: recovered.isZero() ? 'APPROVED' : 'PARTIALLY_RECOVERED',
              },
            });
          }
        }
        await tx.salaryAdvanceRecovery.deleteMany({ where: { payrollRunId: run.id } });
        const advanceCutoff = endOfDay(calendar?.salaryCreditDate ?? run.periodEnd);
        const advances = await tx.salaryAdvance.findMany({
          where: {
            organizationId: context.organizationId,
            status: { in: ['APPROVED', 'PARTIALLY_RECOVERED'] },
            approvedAt: { not: null, lte: advanceCutoff },
          },
          orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        });
        // One pass each, rather than a scan of every collection per employee. With ten thousand
        // employees and a month of attendance the filters this replaces were comparing on the order
        // of a billion pairs; grouping first makes the cost of assembling the run proportional to
        // the data rather than to the product of the data.
        const attendanceByEmployee = groupBy(attendanceRecords, (record) => record.employeeId);
        // Late check-ins cost half a day for every so many, when the organization counts them.
        const lateByEmployee = new Map<string, number>();
        if (settings.lateMarksPerHalfDay > 0)
          for (const mark of await lateMarks(tx, context.organizationId, {
            from: run.periodStart,
            to: run.periodEnd,
          }))
            lateByEmployee.set(mark.employeeId, (lateByEmployee.get(mark.employeeId) ?? 0) + 1);
        const leavesByEmployee = groupBy(approvedLeaves, (leave) => leave.employeeId);
        const timesheetsByEmployee = groupBy(timesheets, (timesheet) => timesheet.employeeId);
        const adjustmentsByEmployee = groupBy(adjustments, (adjustment) => adjustment.employeeId);
        // Recovered in equal monthly shares when the organization spreads it; all at once otherwise.
        const { recoveryMonths } = await readAdvanceRules(tx, context.organizationId);
        const advancesByEmployee = groupBy(
          advances.map((advance) => ({
            ...advance,
            instalment:
              recoveryMonths > 1 && advance.approvedAmount
                ? recoveryInstalment(advance.approvedAmount, recoveryMonths)
                : null,
          })),
          (advance) => advance.employeeId,
        );
        const holidayDatesByEmployee = new Map<string, string[]>();
        for (const sel of employeeHolidaySelections) {
          const list = holidayDatesByEmployee.get(sel.employeeId) ?? [];
          list.push(sel.holiday.holidayDate.toISOString().slice(0, 10));
          holidayDatesByEmployee.set(sel.employeeId, list);
        }
        const empty = Object.freeze([]) as [];

        const snapshot = employees
          .map((employee) => {
            const employeePolicy = employee.payrollPolicies[0] ?? null;
            const selectedPolicy = employeePolicy?.assignmentSource === 'INDIVIDUAL_OVERRIDE'
              ? employeePolicy.payrollPolicy ?? policy
              : policy;
            if (!(employeePolicy?.payrollEnabled ?? selectedPolicy.payrollEnabledDefault))
              return null;
            // Nobody is paid for a period they were not employed in, and someone with nothing to
            // be paid — no salary, no pay component, no one-off adjustment — is not issued an
            // empty payslip that would count them as paid.
            if (
              (employee.dateOfJoining && employee.dateOfJoining > run.periodEnd) ||
              (employee.dateOfLeaving && employee.dateOfLeaving < run.periodStart)
            )
              return null;
            if (
              !employee.compensations[0] && selectedPolicy.defaultGrossSalary == null &&
              employee.payComponents.length === 0 &&
              !(selectedPolicy.components?.length ?? 0) &&
              !adjustmentsByEmployee.get(employee.id)?.length
            )
              return null;
            const employeeComponentIds = new Set(
              employee.payComponents.map((assignment) => assignment.payComponentId),
            );
            const components = [
              ...((selectedPolicy).components ?? [])
                .filter((assignment) => !employeeComponentIds.has(assignment.payComponentId))
                .map((assignment) => ({
                  id: assignment.id,
                  componentId: assignment.payComponentId,
                  amount: assignment.amount,
                  percentage: assignment.percentage,
                  component: assignment.payComponent,
                })),
              ...employee.payComponents.map((assignment) => ({
                id: assignment.id,
                componentId: assignment.payComponentId,
                amount: assignment.amount,
                percentage: assignment.percentage,
                component: assignment.payComponent,
              })),
            ];
            return {
              employeeId: employee.id,
              compensation: employee.compensations[0] ?? (selectedPolicy.defaultGrossSalary == null ? null : {
                grossSalary: selectedPolicy.defaultGrossSalary,
                baseAmount: selectedPolicy.defaultGrossSalary,
                overtimeMultiplier: new Prisma.Decimal(1),
              }),
              employeePolicy,
              assignmentSource: employeePolicy?.assignmentSource === 'INDIVIDUAL_OVERRIDE'
                ? 'INDIVIDUAL_OVERRIDE'
                : 'ORGANIZATION_DEFAULT',
              assignmentRuleId: null,
              policy: selectedPolicy,
              statutoryRules: withNationalStatutoryRules(
                statutoryRules.filter(
                  (rule) =>
                    !selectedPolicy.statutoryJurisdiction ||
                    rule.jurisdiction === selectedPolicy.statutoryJurisdiction,
                ),
                run.periodStart,
              ),
              components,
              timesheet: sumTimesheets(timesheetsByEmployee.get(employee.id) ?? empty),
              overtimeDays: sumOvertimeByDayType(attendanceByEmployee.get(employee.id) ?? empty),
              overtimeRates: readOvertimeRates(settings.metadata),
              leave: summarizeLeave(
                leavesByEmployee.get(employee.id) ?? empty,
                run.periodStart,
                run.periodEnd,
              ),
              // With the working-day calendar, so a working day with no attendance at all is an
              // absence. Without it only days explicitly marked ABSENT were, and someone who never
              // checked in was paid in full.
              attendance: withLateHalfDays(
                lateHalfDays(lateByEmployee.get(employee.id) ?? 0, settings.lateMarksPerHalfDay),
                summarizeAttendance(
                  attendanceByEmployee.get(employee.id) ?? empty,
                  // The company can turn this off; then only days marked ABSENT cost pay.
                  !unmarkedDaysAreAbsent(settings.metadata)
                    ? undefined
                    : {
                        periodStart: run.periodStart,
                        periodEnd: run.periodEnd,
                        workWeekDays: settings.workWeekDays,
                        shifts: employee.shifts,
                        holidays,
                        branchId: employee.primaryBranchId,
                        leaves: leavesByEmployee.get(employee.id) ?? empty,
                        employeeSelectedDates: holidayDatesByEmployee.get(employee.id),
                        dateOfJoining: employee.dateOfJoining,
                        dateOfLeaving: employee.dateOfLeaving,
                      },
                ),
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
                holidayDatesByEmployee.get(employee.id),
              ),
              adjustments: adjustmentsByEmployee.get(employee.id) ?? empty,
              advances: advancesByEmployee.get(employee.id) ?? empty,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        const inputSnapshotHash = hash(snapshot);
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
        // Compute every line first — pure arithmetic, no database — then write the run in a fixed
        // number of set-based statements. The loop this replaces issued two to four round trips per
        // employee while holding the write transaction open, which is what put a ceiling on how large
        // a tenant could be paid at all.
        const rows = snapshot.map((item) =>
          buildPayrollLineRows(context.organizationId, run.id, item, settings.standardDayMinutes),
        );
        const lines = rows.map((row) => row.result);

        for (const batch of chunked(
          rows.map((row) => row.line),
          BULK_INSERT_BATCH,
        ))
          await tx.payrollLineItem.createMany({ data: batch });
        for (const batch of chunked(
          rows.flatMap((row) => row.components),
          BULK_INSERT_BATCH,
        ))
          await tx.payrollLineItemComponent.createMany({ data: batch });
        for (const batch of chunked(
          rows.map((row) => row.payment),
          BULK_INSERT_BATCH,
        ))
          await tx.payrollPayment.createMany({ data: batch });
        const recoveryRows = rows.flatMap((row) => row.recoveries);
        for (const batch of chunked(recoveryRows, BULK_INSERT_BATCH))
          await tx.salaryAdvanceRecovery.createMany({ data: batch });
        // An advance belongs to one employee, so each appears in at most one line's updates. The
        // count is bounded by the advances outstanding in the period, not by headcount.
        for (const update of rows.flatMap((row) => row.advanceUpdates))
          await tx.salaryAdvance.update({
            where: { id: update.id },
            data: { recoveredAmount: update.recoveredAmount, status: update.status },
          });
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
        this.metrics.payrollLines.observe(lines.length);
        return updated;
      },
      {
        timeout: this.config.get<number>('PAYROLL_TRANSACTION_TIMEOUT_MS', 120_000),
        maxWait: this.config.get<number>('PAYROLL_TRANSACTION_MAX_WAIT_MS', 10_000),
      },
    );
  }
}

/** Late marks priced as half-days, alongside the ones attendance already recorded. */
function withLateHalfDays(extra: number, summary: { absentDays: number; halfDays: number }) {
  return extra ? { ...summary, halfDays: summary.halfDays + extra } : summary;
}
