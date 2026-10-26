import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { decryptEmployeeSecret } from '../employees/employee-sensitive-data';

type Scheme = 'EPF' | 'ESIC' | 'PT';
const SCHEME_ALIASES: Record<Scheme, string[]> = {
  EPF: ['EPF', 'PF'],
  ESIC: ['ESIC', 'ESI'],
  PT: ['PT', 'PROFESSIONAL_TAX'],
};
const FINAL = ['RELEASED', 'LOCKED'] as const;
const TAX_CODES = ['TDS', 'INCOME_TAX', 'IT'];
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

type StatutoryEntry = {
  schemeCode?: string;
  employeeAmount?: unknown;
  employerAmount?: unknown;
  basis?: unknown;
  eligible?: boolean;
};

/**
 * What payroll hands to others once a run is final: the statutory returns (EPF, ESIC, professional
 * tax) as the figures the calculation actually used, the bank transfer file, and each employee's
 * annual statement of salary and deductions.
 *
 * Nothing here recalculates. Every figure is read from the released run's line items, so what is
 * filed is what was paid.
 */
@Injectable()
export class PayrollReportsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** One scheme's contributions for a run, with each person's registration number. */
  statutory(context: DomainContext, runId: string, scheme: Scheme) {
    requirePermission(context, 'payroll.runs.read');
    return this.database.run(context, async (tx) => {
      const run = await finalRun(tx, context, runId);
      const lines = await tx.payrollLineItem.findMany({
        where: { organizationId: context.organizationId, payrollRunId: run.id },
        select: {
          employeeId: true,
          grossAmount: true,
          calculationBreakdown: true,
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
        orderBy: { employee: { employeeNumber: 'asc' } },
      });
      const registrations = await tx.employeeStatutoryProfile.findMany({
        where: {
          organizationId: context.organizationId,
          schemeCode: { in: SCHEME_ALIASES[scheme] },
          effectiveFrom: { lte: run.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
        },
        select: { employeeId: true, registrationNumber: true },
      });
      const numbers = new Map(registrations.map((row) => [row.employeeId, row.registrationNumber]));
      const rows = lines.flatMap((line) => {
        const entries =
          (line.calculationBreakdown as { statutory?: StatutoryEntry[] } | null)?.statutory ?? [];
        const entry = entries.find(
          (item) =>
            item.eligible && SCHEME_ALIASES[scheme].includes(String(item.schemeCode).toUpperCase()),
        );
        if (!entry) return [];
        return [
          {
            employeeNumber: line.employee.employeeNumber,
            name: `${line.employee.firstName} ${line.employee.lastName}`.trim(),
            registrationNumber: numbers.get(line.employeeId) ?? null,
            grossWages: money(line.grossAmount),
            wageBasis: money(entry.basis),
            employeeContribution: money(entry.employeeAmount),
            employerContribution: money(entry.employerAmount),
          },
        ];
      });
      return {
        run: period(run),
        scheme,
        rows,
        totals: {
          employees: rows.length,
          employeeContribution: money(rows.reduce((sum, row) => sum + row.employeeContribution, 0)),
          employerContribution: money(rows.reduce((sum, row) => sum + row.employerContribution, 0)),
        },
        missingRegistration: rows.filter((row) => !row.registrationNumber).length,
      };
    });
  }

  /** Net pay per person with their bank details, for the transfer. Audited: it holds accounts. */
  bankFile(context: DomainContext, runId: string) {
    requirePermission(context, 'payroll.payments.write');
    return this.database.run(context, async (tx) => {
      const run = await finalRun(tx, context, runId);
      const lines = await tx.payrollLineItem.findMany({
        where: {
          organizationId: context.organizationId,
          payrollRunId: run.id,
          netAmount: { gt: 0 },
        },
        select: {
          employeeId: true,
          netAmount: true,
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
        orderBy: { employee: { employeeNumber: 'asc' } },
      });
      const accounts = await tx.employeeBankAccount.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: { in: lines.map((line) => line.employeeId) },
          isPrimary: true,
          effectiveFrom: { lte: run.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodEnd } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      const accountOf = new Map<string, (typeof accounts)[number]>();
      for (const account of accounts)
        if (!accountOf.has(account.employeeId)) accountOf.set(account.employeeId, account);
      const rows = lines.map((line) => {
        const account = accountOf.get(line.employeeId);
        return {
          employeeNumber: line.employee.employeeNumber,
          name: `${line.employee.firstName} ${line.employee.lastName}`.trim(),
          accountHolder: account?.accountHolderName ?? null,
          accountNumber: account
            ? decryptEmployeeSecret(this.config, account.accountNumberEncrypted)
            : null,
          ifsc: account?.ifscCode ?? null,
          bank: account?.bankName ?? null,
          amount: money(line.netAmount),
        };
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          action: 'PAYROLL_BANK_FILE_EXPORTED',
          afterState: { employees: rows.length },
        },
        tx,
      );
      return {
        run: period(run),
        rows,
        total: money(rows.reduce((sum, row) => sum + row.amount, 0)),
        missingAccounts: rows.filter((row) => !row.accountNumber || !row.ifsc).length,
      };
    });
  }

  /**
   * A person's salary and deductions for a financial year (April to March), month by month, from
   * released payslips — what Part B of Form 16 is prepared from. Part A, the TDS certificate, is
   * issued through the income-tax department's TRACES portal and cannot be produced here.
   */
  annualStatement(context: DomainContext, employeeId: string, financialYear: number) {
    return this.database.run(context, async (tx) => {
      const readsAll =
        context.permissions.has('*') || context.permissions.has('payroll.payslips.read.all');
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          personalProfile: { select: { panNumberEncrypted: true } },
        },
      });
      const own = employee?.userId && employee.userId === context.actor.userId;
      if (!employee || (!readsAll && !own)) throw new NotFoundError('Employee');
      requirePermission(context, 'payroll.payslips.read');
      const from = new Date(Date.UTC(financialYear, 3, 1));
      const to = new Date(Date.UTC(financialYear + 1, 2, 31));
      const lines = await tx.payrollLineItem.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          payrollRun: {
            status: { in: [...FINAL] },
            periodStart: { gte: from },
            periodEnd: { lte: to },
          },
        },
        orderBy: { payrollRun: { periodStart: 'asc' } },
        select: {
          grossAmount: true,
          deductionAmount: true,
          netAmount: true,
          calculationBreakdown: true,
          payrollRun: { select: { periodStart: true, periodEnd: true } },
          components: { select: { componentCode: true, componentType: true, amount: true } },
        },
      });
      const months = lines.map((line) => {
        const statutory =
          (line.calculationBreakdown as { statutory?: StatutoryEntry[] } | null)?.statutory ?? [];
        const sum = (codes: string[]) =>
          money(
            statutory
              .filter((item) => codes.includes(String(item.schemeCode).toUpperCase()))
              .reduce((total, item) => total + Number(item.employeeAmount ?? 0), 0),
          );
        return {
          periodStart: line.payrollRun.periodStart.toISOString().slice(0, 10),
          periodEnd: line.payrollRun.periodEnd.toISOString().slice(0, 10),
          gross: money(line.grossAmount),
          providentFund: sum(SCHEME_ALIASES.EPF),
          esic: sum(SCHEME_ALIASES.ESIC),
          professionalTax: sum(SCHEME_ALIASES.PT),
          taxDeducted: money(
            line.components
              .filter(
                (item) =>
                  item.componentType === 'DEDUCTION' &&
                  TAX_CODES.includes(item.componentCode.toUpperCase()),
              )
              .reduce((total, item) => total + Number(item.amount), 0),
          ),
          totalDeductions: money(line.deductionAmount),
          net: money(line.netAmount),
        };
      });
      const total = (key: keyof (typeof months)[number]) =>
        money(months.reduce((sum, month) => sum + Number(month[key]), 0));
      const pan = decryptEmployeeSecret(
        this.config,
        employee.personalProfile?.panNumberEncrypted ?? null,
      );
      return {
        employee: {
          name: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeNumber: employee.employeeNumber,
          pan,
        },
        financialYear: `${financialYear}-${String((financialYear + 1) % 100).padStart(2, '0')}`,
        months,
        totals: {
          gross: total('gross'),
          providentFund: total('providentFund'),
          esic: total('esic'),
          professionalTax: total('professionalTax'),
          taxDeducted: total('taxDeducted'),
          totalDeductions: total('totalDeductions'),
          net: total('net'),
        },
      };
    });
  }
}

async function finalRun(tx: Prisma.TransactionClient, context: DomainContext, runId: string) {
  const run = await tx.payrollRun.findFirst({
    where: { id: runId, organizationId: context.organizationId },
    select: { id: true, status: true, periodStart: true, periodEnd: true },
  });
  if (!run) throw new NotFoundError('Payroll run');
  if (!FINAL.includes(run.status as (typeof FINAL)[number]))
    throw new ConflictError('Reports are prepared from a released payroll run.');
  return run;
}

function period(run: { id: string; periodStart: Date; periodEnd: Date }) {
  return {
    id: run.id,
    periodStart: run.periodStart.toISOString().slice(0, 10),
    periodEnd: run.periodEnd.toISOString().slice(0, 10),
  };
}
