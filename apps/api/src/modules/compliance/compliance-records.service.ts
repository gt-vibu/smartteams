import { Injectable } from '@nestjs/common';
import { OutboxService } from '../federation/outbox.service';
import { Prisma } from '../../generated/prisma/client';
import { AccessMode, ComplianceRecordStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  RecordInput,
  assertComplianceTransition,
  dateOnly,
  validateAmounts,
  validateMetadata,
  assertEmployee,
  employeeScope,
} from './compliance-shared';

@Injectable()
export class ComplianceRecordsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

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
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
          ...(filters.schemeCode ? { schemeCode: filters.schemeCode.trim().toUpperCase() } : {}),
          ...(filters.periodStart ? { periodStart: { gte: dateOnly(filters.periodStart) } } : {}),
          ...(filters.periodEnd ? { periodEnd: { lte: dateOnly(filters.periodEnd) } } : {}),
        },
        orderBy: [{ periodStart: 'desc' }, { schemeCode: 'asc' }],
        take: filters.limit ?? 200,
      });
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
      await assertEmployee(tx, context, employeeId);
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
}
