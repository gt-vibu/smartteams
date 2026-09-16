import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  PayFrequency,
  PayrollAdjustmentSource,
  PayrollAdjustmentType,
  PayrollRunStatus,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  dateOnly,
  emptyHash,
  payrollTransitionPermission,
  validTransition,
} from './payroll-calculation';
import { createPayslips } from './payroll-line-calculator';

/**
 * The life of a payroll run: creating one, adjusting it, moving it between states, and
 * superseding a released one with a correction.
 *
 * Separate from the calculator on purpose. This file decides *whether* a run may change; the
 * calculator decides what the numbers are. Mixing the two is how a state machine ends up with
 * arithmetic in its guards.
 */
@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listRuns(context: DomainContext) {
    requirePermission(context, 'payroll.runs.read');
    return this.database.run(context, (tx) =>
      tx.payrollRun.findMany({
        where: { organizationId: context.organizationId },
        orderBy: { periodStart: 'desc' },
      }),
    );
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
      // Lock before reading the state the transition is judged against, so two callers cannot both
      // see CALCULATED and both move the run to APPROVED. The unique constraint on
      // `[payrollRunId, approverUserId]` already stops one person approving twice; this is what
      // stops two people doing it at the same moment.
      await tx.$queryRaw`SELECT id FROM payroll_runs WHERE id = ${runId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
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
        await createPayslips(tx, context.organizationId, run.id);
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
}
