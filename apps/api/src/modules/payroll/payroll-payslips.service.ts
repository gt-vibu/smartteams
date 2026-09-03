import { Injectable } from '@nestjs/common';
import { AccessMode, PayrollRunStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { mergeSalaryComponents } from './payroll-component-rules';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import {
  decodePayrollCursor,
  detailedSalarySlipAllowed,
  employeeScope,
  encodePayrollCursor,
} from './payroll-shared';

/**
 * The read side of payroll: payslips and the pay ledger.
 *
 * Kept apart from the write side because the rules that matter here are about who may see whose
 * figures, not about how those figures were produced. Both reads are self-scoped the same way:
 * your own payslips unless you hold the organization-wide permission.
 */
@Injectable()
export class PayrollPayslipsService {
  constructor(private readonly database: TenantDatabaseService) {}

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
            ...employeeScope(context),
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
            ...employeeScope(context),
          },
          select: { id: true },
        });
        if (!employee) throw new ConflictError('Employees may only read their own payslips');
      }
      const payslips = await tx.payslip.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
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
            ...employeeScope(context),
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
            ...employeeScope(context),
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
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
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
}
