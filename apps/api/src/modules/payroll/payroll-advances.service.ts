import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  AccessMode,
  PayrollPaymentStatus,
  SalaryAdvanceStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { markPayrollStale } from './payroll-staleness';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import {
  type AdvanceDecisionInput,
  type AdvanceInput,
  type PaymentInput,
} from './payroll-policy.types';
import { employeeScope, resolveEmployeeId } from './payroll-policy-access';
import { pageArgs, toPage, type ListPage } from './payroll-list-page';
import { canActForAllEmployees, resolveActingEmployeeId } from '../employees/employee-scope';

/**
 * Salary advances and payment marking.
 *
 * An advance is money paid before the run that recovers against later ones; marking a payment
 * records that a released line actually left the bank. Both sit outside the calculation.
 */
@Injectable()
export class PayrollAdvancesService {
  constructor(private readonly database: TenantDatabaseService) {}

  /** Every advance when called without a page (Federation's frozen shape); one page otherwise. */
  async listAdvances(context: DomainContext, requestedEmployeeId?: string, page?: ListPage) {
    requirePermission(context, 'payroll.advances.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.advances.read.all',
      );
      const where = {
        organizationId: context.organizationId,
        ...(employeeId ? { employeeId } : {}),
        ...(context.branchId ? { employee: employeeScope(context) } : {}),
      };
      if (!page)
        return tx.salaryAdvance.findMany({
          where,
          include: { recoveries: true },
          orderBy: { requestedAt: 'desc' },
        });
      const rows = await tx.salaryAdvance.findMany({
        where,
        include: { recoveries: true },
        // The id breaks ties, so two advances raised in the same instant cannot swap across pages.
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(page),
      });
      return toPage(rows, page);
    });
  }

  async requestAdvance(context: DomainContext, input: AdvanceInput) {
    requirePermission(context, 'payroll.advances.request');
    requireReason({ ...context, reason: input.reason }, 'Advance request requires a reason');
    return this.database.run(context, async (tx) => {
      // Raising an advance for someone else is acting for them, and is refused the way every other
      // self-service write is (403). The lookup below used to be the only guard, and it reports a
      // refusal the way a read does, as a conflict.
      if (!canActForAllEmployees(context, 'payroll.employee-profile.read.all'))
        await resolveActingEmployeeId(
          tx,
          context,
          input.employeeId,
          'payroll.employee-profile.read.all',
        );
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        input.employeeId,
        false,
        'payroll.employee-profile.read.all',
      );
      if (!employeeId) throw new NotFoundError('Employee');
      if (input.amount <= 0 || !Number.isFinite(input.amount))
        throw new ConflictError('Advance amount must be greater than zero');
      return tx.salaryAdvance.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          requestedAmount: new Prisma.Decimal(input.amount),
          reason: input.reason.trim(),
          externalId: input.externalId,
          source: context.accessMode === AccessMode.FEDERATION ? 'FEDERATION' : 'NATIVE',
        },
      });
    });
  }

  async decideAdvance(context: DomainContext, advanceId: string, input: AdvanceDecisionInput) {
    requirePermission(context, 'payroll.advances.approve');
    requireReason({ ...context, reason: input.comment }, 'Advance decisions require a reason');
    return this.database.run(context, async (tx) => {
      // Two callers deciding at once both read REQUESTED and both pass the guard below, which for
      // a financial record means two approvals of the same advance. Locking first makes the second
      // read the state the first committed and be refused.
      await tx.$queryRaw`SELECT id FROM salary_advances WHERE id = ${advanceId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const advance = await tx.salaryAdvance.findFirst({
        where: {
          id: advanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { employee: { select: { userId: true } } },
      });
      if (!advance || advance.status !== SalaryAdvanceStatus.REQUESTED)
        throw new ConflictError('Advance is not awaiting a decision');
      // An advance is money paid out ahead of payroll. Holding `payroll.advances.approve` must not
      // let a payroll officer approve, or reject and re-raise, an advance to themselves. A
      // federation context has no user and so no "self"; its grants bound it upstream.
      if (context.actor.userId && advance.employee.userId === context.actor.userId)
        throw new ForbiddenDomainError('You cannot decide your own salary advance');
      if (input.status === 'APPROVED') {
        const amount = input.approvedAmount ?? Number(advance.requestedAmount);
        if (amount <= 0 || amount > Number(advance.requestedAmount))
          throw new ConflictError('Approved advance cannot exceed the requested amount');
        // An approved advance is recovered from net pay, so any run already calculated for a
        // period covering the approval now omits a deduction it should carry.
        await markPayrollStale(tx, context.organizationId, new Date());
        return tx.salaryAdvance.update({
          where: { id: advance.id },
          data: {
            status: SalaryAdvanceStatus.APPROVED,
            approvedAmount: new Prisma.Decimal(amount),
            approvedAt: new Date(),
            approvedByUserId: context.actor.userId,
          },
        });
      }
      return tx.salaryAdvance.update({
        where: { id: advance.id },
        data: {
          status: input.status,
          rejectedAt: new Date(),
          rejectedByUserId: context.actor.userId,
        },
      });
    });
  }

  /** Every payment when called without a page (Federation's frozen shape); one page otherwise. */
  async listPayments(context: DomainContext, requestedEmployeeId?: string, page?: ListPage) {
    requirePermission(context, 'payroll.payments.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.payments.read.all',
      );
      const where = {
        organizationId: context.organizationId,
        ...(employeeId ? { employeeId } : {}),
        ...(context.branchId ? { employee: employeeScope(context) } : {}),
      };
      const include = {
        payrollRun: { select: { periodStart: true, periodEnd: true, status: true } },
      };
      if (!page)
        return tx.payrollPayment.findMany({ where, include, orderBy: { createdAt: 'desc' } });
      const rows = await tx.payrollPayment.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(page),
      });
      return toPage(rows, page);
    });
  }

  async markPaymentPaid(context: DomainContext, lineItemId: string, input: PaymentInput) {
    requirePermission(context, 'payroll.payments.write');
    return this.database.run(context, async (tx) => {
      const line = await tx.payrollLineItem.findFirst({
        where: {
          id: lineItemId,
          organizationId: context.organizationId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { payrollRun: true },
      });
      if (!line || !['RELEASED', 'LOCKED'].includes(line.payrollRun.status))
        throw new ConflictError('Only released payroll lines can be paid');
      const existing = await tx.payrollPayment.findUnique({
        where: { payrollLineItemId: line.id },
      });
      if (existing?.status === PayrollPaymentStatus.PAID)
        throw new ConflictError('Payroll line is already marked paid');
      return tx.payrollPayment.upsert({
        where: { payrollLineItemId: line.id },
        create: {
          organizationId: context.organizationId,
          payrollRunId: line.payrollRunId,
          payrollLineItemId: line.id,
          employeeId: line.employeeId,
          amount: line.netAmount,
          status: PayrollPaymentStatus.PAID,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paidAt: new Date(),
          markedByUserId: context.actor.userId,
        },
        update: {
          status: PayrollPaymentStatus.PAID,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paidAt: new Date(),
          markedByUserId: context.actor.userId,
          failureReason: null,
        },
      });
    });
  }
}
