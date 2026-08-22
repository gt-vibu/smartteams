import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessMode, ComplianceRecordStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';

type ProfileInput = {
  schemeCode: string;
  registrationNumber?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  employeeRate?: number;
  employerRate?: number;
  metadata?: Record<string, unknown>;
};
type RecordInput = {
  schemeCode: string;
  periodStart: string;
  periodEnd: string;
  status?: ComplianceRecordStatus;
  employeeAmount?: number;
  employerAmount?: number;
  dueDate?: string;
  filingReference?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ComplianceService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async profiles(context: DomainContext, employeeId: string) {
    requirePermission(context, 'payroll.compliance.read');
    return this.database.run(context, async (tx) => {
      const canReadAll =
        context.accessMode === AccessMode.FEDERATION ||
        context.permissions.has('*') ||
        context.permissions.has('payroll.compliance.read.all');
      if (!canReadAll) {
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!employee || employee.id !== employeeId)
          throw new ConflictError('Employees may only read their own compliance profiles');
      }
      return tx.employeeStatutoryProfile.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
        },
        orderBy: [{ schemeCode: 'asc' }, { effectiveFrom: 'desc' }],
      });
    });
  }

  async records(
    context: DomainContext,
    employeeId: string | undefined,
    filters: { schemeCode?: string; periodStart?: string; periodEnd?: string; limit?: number },
  ) {
    requirePermission(context, 'payroll.compliance.read');
    return this.database.run(context, async (tx) => {
      let targetEmployeeId = employeeId;
      if (!(
        context.accessMode === AccessMode.FEDERATION ||
        context.permissions.has('*') ||
        context.permissions.has('payroll.compliance.read.all')
      )) {
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!employee) return [];
        if (employeeId && employeeId !== employee.id)
          throw new ConflictError('Employees may only read their own compliance records');
        targetEmployeeId = employee.id;
      }
      return tx.employeeStatutoryRecord.findMany({
        where: {
          organizationId: context.organizationId,
          ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
          ...(context.branchId ? { employee: this.employeeScope(context) } : {}),
          ...(filters.schemeCode ? { schemeCode: filters.schemeCode.trim().toUpperCase() } : {}),
          ...(filters.periodStart ? { periodStart: { gte: dateOnly(filters.periodStart) } } : {}),
          ...(filters.periodEnd ? { periodEnd: { lte: dateOnly(filters.periodEnd) } } : {}),
        },
        orderBy: [{ periodStart: 'desc' }, { schemeCode: 'asc' }],
        take: filters.limit ?? 200,
      });
    });
  }

  async upsertProfile(context: DomainContext, employeeId: string, input: ProfileInput) {
    requirePermission(context, 'payroll.compliance.write');
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw new ConflictError('Statutory profile end must not precede its start');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context, employeeId);
      const profile = await tx.employeeStatutoryProfile.upsert({
        where: {
          organizationId_employeeId_schemeCode_effectiveFrom: {
            organizationId: context.organizationId,
            employeeId,
            schemeCode: input.schemeCode.trim().toUpperCase(),
            effectiveFrom,
          },
        },
        create: {
          organizationId: context.organizationId,
          employeeId,
          schemeCode: input.schemeCode.trim().toUpperCase(),
          registrationNumber: input.registrationNumber?.trim(),
          effectiveFrom,
          effectiveTo,
          employeeRate:
            input.employeeRate === undefined ? undefined : new Prisma.Decimal(input.employeeRate),
          employerRate:
            input.employerRate === undefined ? undefined : new Prisma.Decimal(input.employerRate),
          metadata: input.metadata ? jsonSnapshot(validateMetadata(input.metadata)) : undefined,
        },
        update: {
          registrationNumber: input.registrationNumber?.trim(),
          effectiveTo,
          employeeRate:
            input.employeeRate === undefined ? undefined : new Prisma.Decimal(input.employeeRate),
          employerRate:
            input.employerRate === undefined ? undefined : new Prisma.Decimal(input.employerRate),
          metadata: input.metadata ? jsonSnapshot(validateMetadata(input.metadata)) : undefined,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_STATUTORY_PROFILE',
          entityId: profile.id,
          action: 'STATUTORY_PROFILE_UPSERTED',
          afterState: jsonSnapshot(profile),
        },
        tx,
      );
      return profile;
    });
  }

  async upsertRecord(
    context: DomainContext,
    employeeId: string,
    input: RecordInput,
    reason: string,
  ) {
    requirePermission(context, 'payroll.compliance.write');
    requireReason({ ...context, reason }, 'Statutory record changes require a reason');
    const periodStart = dateOnly(input.periodStart);
    const periodEnd = dateOnly(input.periodEnd);
    if (periodEnd < periodStart)
      throw new ConflictError('Compliance period end must not precede its start');
    validateAmounts(input.employeeAmount, input.employerAmount);
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context, employeeId);
      const existing = await tx.employeeStatutoryRecord.findUnique({
        where: {
          organizationId_employeeId_schemeCode_periodStart_periodEnd: {
            organizationId: context.organizationId,
            employeeId,
            schemeCode: input.schemeCode.trim().toUpperCase(),
            periodStart,
            periodEnd,
          },
        },
      });
      const status = input.status ?? existing?.status ?? ComplianceRecordStatus.DRAFT;
      assertComplianceTransition(existing?.status, status);
      const filingReference = input.filingReference?.trim() || existing?.filingReference;
      if (
        (status === ComplianceRecordStatus.SUBMITTED ||
          status === ComplianceRecordStatus.ACCEPTED) &&
        !filingReference
      ) {
        throw new ConflictError('A filing reference is required before submitting compliance data');
      }
      const metadata = input.metadata ? jsonSnapshot(validateMetadata(input.metadata)) : undefined;
      const record = await tx.employeeStatutoryRecord.upsert({
        where: {
          organizationId_employeeId_schemeCode_periodStart_periodEnd: {
            organizationId: context.organizationId,
            employeeId,
            schemeCode: input.schemeCode.trim().toUpperCase(),
            periodStart,
            periodEnd,
          },
        },
        create: {
          organizationId: context.organizationId,
          employeeId,
          schemeCode: input.schemeCode.trim().toUpperCase(),
          periodStart,
          periodEnd,
          status,
          employeeAmount:
            input.employeeAmount === undefined
              ? undefined
              : new Prisma.Decimal(input.employeeAmount),
          employerAmount:
            input.employerAmount === undefined
              ? undefined
              : new Prisma.Decimal(input.employerAmount),
          dueDate: input.dueDate ? dateOnly(input.dueDate) : undefined,
          filingReference,
          metadata,
          submittedAt:
            status === ComplianceRecordStatus.SUBMITTED ||
            status === ComplianceRecordStatus.ACCEPTED
              ? new Date()
              : undefined,
        },
        update: {
          status,
          employeeAmount:
            input.employeeAmount === undefined
              ? undefined
              : new Prisma.Decimal(input.employeeAmount),
          employerAmount:
            input.employerAmount === undefined
              ? undefined
              : new Prisma.Decimal(input.employerAmount),
          dueDate: input.dueDate ? dateOnly(input.dueDate) : undefined,
          filingReference,
          metadata,
          version: { increment: 1 },
          submittedAt:
            status === ComplianceRecordStatus.SUBMITTED ||
            status === ComplianceRecordStatus.ACCEPTED
              ? (existing?.submittedAt ?? new Date())
              : null,
        },
      });
      await this.audit.record(
        { ...context, reason },
        {
          entityType: 'EMPLOYEE_STATUTORY_RECORD',
          entityId: record.id,
          action: 'STATUTORY_RECORD_UPSERTED',
          afterState: jsonSnapshot(record),
          reason,
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'EmployeeStatutoryRecord',
          aggregateId: record.id,
          aggregateVersion: record.version,
          eventType: 'employee.statutory_record.changed',
          payload: jsonSnapshot(record),
        },
        tx,
      );
      return record;
    });
  }

  private async assertEmployee(
    tx: Parameters<Parameters<TenantDatabaseService['run']>[1]>[0],
    context: DomainContext,
    employeeId: string,
  ) {
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: context.organizationId,
        ...this.employeeScope(context),
      },
      select: { id: true },
    });
    if (!employee) throw new NotFoundError('Employee');
  }

  private employeeScope(context: DomainContext): Prisma.EmployeeWhereInput {
    return context.branchId
      ? {
          OR: [
            { primaryBranchId: context.branchId },
            { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
          ],
        }
      : {};
  }
}

function dateOnly(value: string) {
  const result = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) || Number.isNaN(result.getTime()))
    throw new ConflictError('Invalid calendar date');
  return result;
}

function validateMetadata(metadata: Record<string, unknown>) {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 32_768) throw new ConflictError('Compliance metadata is too large');
  return metadata;
}

function validateAmounts(employeeAmount?: number, employerAmount?: number) {
  for (const amount of [employeeAmount, employerAmount]) {
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      throw new ConflictError('Compliance amounts must be finite and non-negative');
    }
  }
}

export function assertComplianceTransition(
  current: ComplianceRecordStatus | undefined,
  next: ComplianceRecordStatus,
) {
  if (!current) return;
  if (current === ComplianceRecordStatus.ACCEPTED) {
    throw new ConflictError('Accepted compliance records are immutable');
  }
  if (current === next) return;
  const allowed: Record<ComplianceRecordStatus, readonly ComplianceRecordStatus[]> = {
    [ComplianceRecordStatus.DRAFT]: [ComplianceRecordStatus.READY, ComplianceRecordStatus.REJECTED],
    [ComplianceRecordStatus.READY]: [
      ComplianceRecordStatus.SUBMITTED,
      ComplianceRecordStatus.REJECTED,
    ],
    [ComplianceRecordStatus.SUBMITTED]: [
      ComplianceRecordStatus.ACCEPTED,
      ComplianceRecordStatus.REJECTED,
    ],
    [ComplianceRecordStatus.ACCEPTED]: [],
    [ComplianceRecordStatus.REJECTED]: [ComplianceRecordStatus.DRAFT, ComplianceRecordStatus.READY],
  };
  if (!allowed[current].includes(next)) {
    throw new ConflictError(`Compliance record cannot transition from ${current} to ${next}`);
  }
}
