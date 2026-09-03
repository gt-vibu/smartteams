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
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import {
  type AdvanceDecisionInput,
  type AdvanceInput,
  type PaymentInput,
} from './payroll-policy.types';
import { employeeScope, resolveEmployeeId } from './payroll-policy-access';

/**
 * Salary advances and payment marking.
 *
 * An advance is money paid before the run that recovers against later ones; marking a payment
 * records that a released line actually left the bank. Both sit outside the calculation.
 */
@Injectable()
export class PayrollAdvancesService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listAdvances(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.advances.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.advances.read.all',
      );
      return tx.salaryAdvance.findMany({
        where: {
          organizationId: context.organizationId,
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { recoveries: true },
        orderBy: { requestedAt: 'desc' },
      });
    });
  }

  async requestAdvance(context: DomainContext, input: AdvanceInput) {
    requirePermission(context, 'payroll.advances.request');
    requireReason({ ...context, reason: input.reason }, 'Advance request requires a reason');
    return this.database.run(context, async (tx) => {
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
      const advance = await tx.salaryAdvance.findFirst({
        where: {
          id: advanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
      });
      if (!advance || advance.status !== SalaryAdvanceStatus.REQUESTED)
        throw new ConflictError('Advance is not awaiting a decision');
      if (input.status === 'APPROVED') {
        const amount = input.approvedAmount ?? Number(advance.requestedAmount);
        if (amount <= 0 || amount > Number(advance.requestedAmount))
          throw new ConflictError('Approved advance cannot exceed the requested amount');
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

  async listPayments(context: DomainContext, requestedEmployeeId?: string) {
    requirePermission(context, 'payroll.payments.read');
    return this.database.run(context, async (tx) => {
      const employeeId = await resolveEmployeeId(
        tx,
        context,
        requestedEmployeeId,
        true,
        'payroll.payments.read.all',
      );
      return tx.payrollPayment.findMany({
        where: {
          organizationId: context.organizationId,
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        include: { payrollRun: { select: { periodStart: true, periodEnd: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      });
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
