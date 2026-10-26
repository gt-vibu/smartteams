import { approvalAutomationSchema, type ApprovalAutomation } from '@smarteam/contracts';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { workDateInTimeZone } from '../attendance/attendance-shared';

export function validateAutomation(domain: string, value: unknown): ApprovalAutomation {
  const parsed = approvalAutomationSchema.safeParse(value ?? {});
  if (!parsed.success) throw new ConflictError('Invalid automatic approval settings');
  const rule = parsed.data;
  if (rule.mode !== 'MANUAL' && !['LEAVE', 'ATTENDANCE_CORRECTION'].includes(domain))
    throw new ConflictError(
      'Automatic approval is available for leave and attendance corrections only',
    );
  if (rule.mode === 'CONDITIONAL' && domain === 'LEAVE' && rule.maxLeaveDays === undefined)
    throw new ConflictError('Conditional leave approval needs a maximum number of days');
  if (
    rule.mode === 'CONDITIONAL' &&
    domain === 'ATTENDANCE_CORRECTION' &&
    (rule.maxChangedMinutes === undefined || rule.maxCorrectionAgeDays === undefined)
  )
    throw new ConflictError(
      'Conditional attendance approval needs a change limit and a request age limit',
    );
  return rule;
}

export function automaticApproval(
  ruleValue: unknown,
  facts: {
    branchId?: string | null;
    leaveTypeId?: string;
    leaveDays?: number;
    noticeDays?: number;
    correctionAgeDays?: number;
    changedMinutes?: number;
    correctionsThisMonth?: number;
    requiresReview?: boolean;
    today?: string;
  },
  now = new Date(),
) {
  const parsed = approvalAutomationSchema.safeParse(ruleValue ?? {});
  if (!parsed.success) return false;
  const rule = parsed.data;
  if (rule.mode === 'MANUAL' || facts.requiresReview) return false;
  if (rule.effectiveOn && rule.effectiveOn > (facts.today ?? now.toISOString().slice(0, 10)))
    return false;
  if (rule.branchIds.length && (!facts.branchId || !rule.branchIds.includes(facts.branchId)))
    return false;
  if (
    rule.leaveTypeIds.length &&
    (!facts.leaveTypeId || !rule.leaveTypeIds.includes(facts.leaveTypeId))
  )
    return false;
  const limits: Array<[number | undefined, number | undefined, 'max' | 'min']> = [
    [rule.maxLeaveDays, facts.leaveDays, 'max'],
    [rule.minNoticeDays, facts.noticeDays, 'min'],
    [rule.maxCorrectionAgeDays, facts.correctionAgeDays, 'max'],
    [rule.maxChangedMinutes, facts.changedMinutes, 'max'],
    [rule.maxCorrectionsPerMonth, facts.correctionsThisMonth, 'max'],
  ];
  return limits.every(
    ([limit, actual, direction]) =>
      limit === undefined ||
      (actual !== undefined &&
        Number.isFinite(actual) &&
        actual >= 0 &&
        (direction === 'max' ? actual <= limit : actual >= limit)),
  );
}

export function systemApprovalContext(context: DomainContext): DomainContext {
  return { ...context, actor: { type: 'SYSTEM' }, permissions: new Set() };
}

export async function approvalTimeZone(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId?: string | null,
) {
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  const branch = branchId
    ? await tx.branch.findFirst({
        where: { id: branchId, organizationId },
        select: { timezone: true },
      })
    : null;
  return branch?.timezone ?? organization.timezone;
}

export async function approvalLocalDate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId?: string | null,
  now = new Date(),
) {
  return workDateInTimeZone(now, await approvalTimeZone(tx, organizationId, branchId));
}

export async function assertAutomationScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  rule: ApprovalAutomation,
) {
  const branches = [...new Set(rule.branchIds)],
    types = [...new Set(rule.leaveTypeIds)];
  if (
    branches.length &&
    (await tx.branch.count({ where: { organizationId, id: { in: branches } } })) !== branches.length
  )
    throw new ConflictError('Choose branches belonging to this organization.');
  if (
    types.length &&
    (await tx.leaveType.count({ where: { organizationId, id: { in: types }, isActive: true } })) !==
      types.length
  )
    throw new ConflictError('Choose active leave types belonging to this organization.');
}

/** Serialize payroll boundary checks with approval/release so a late change cannot slip through. */
export async function assertOpenPayrollPeriod(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
) {
  await tx.$queryRaw`SELECT id FROM payroll_runs WHERE organization_id = ${organizationId}::uuid
    AND period_start <= ${to} AND period_end >= ${from} FOR UPDATE`;
  const closed = await tx.payrollRun.findFirst({
    where: {
      organizationId,
      periodStart: { lte: to },
      periodEnd: { gte: from },
      status: { in: ['RELEASED', 'LOCKED'] },
    },
    select: { id: true },
  });
  if (closed)
    throw new ConflictError(
      'Payroll for these dates has been released. Ask payroll administration to use a correction run.',
    );
  const unreopened = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT original.id FROM payroll_runs original
    WHERE original.organization_id = ${organizationId}::uuid AND original.status = 'CORRECTED'
    AND original.period_start <= ${to} AND original.period_end >= ${from}
    AND NOT EXISTS (SELECT 1 FROM payroll_runs replacement WHERE replacement.organization_id = original.organization_id
      AND replacement.period_start = original.period_start AND replacement.period_end = original.period_end
      AND replacement.correction_of_run_id IS NOT NULL AND replacement.status IN ('DRAFT', 'CALCULATED', 'APPROVED'))`;
  if (unreopened.length)
    throw new ConflictError(
      'The payroll correction is closed. Ask payroll administration to open a replacement correction run.',
    );
}
