import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessMode } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  ProfileInput,
  STATUTORY_SCHEME_CATALOG,
  dateOnly,
  validateMetadata,
  assertEmployee,
  employeeScope,
} from './compliance-shared';

@Injectable()
export class ComplianceProfilesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  schemes(context: DomainContext) {
    requirePermission(context, 'payroll.compliance.read');
    return STATUTORY_SCHEME_CATALOG;
  }

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
          ...(context.branchId ? { employee: employeeScope(context) } : {}),
        },
        orderBy: [{ schemeCode: 'asc' }, { effectiveFrom: 'desc' }],
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
      await assertEmployee(tx, context, employeeId);
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
}
