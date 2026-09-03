import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly, validateStatutoryRule, type StatutoryRuleInput } from './payroll-policy.types';

/**
 * Statutory rules per jurisdiction — the rates and ceilings that drive PF, ESI and PT.
 *
 * Reference data a tenant maintains rather than transactional records, which is why it is
 * separate from the runs that consume it.
 */
@Injectable()
export class PayrollStatutoryService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listStatutoryRules(context: DomainContext, jurisdiction?: string) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) =>
      tx.payrollStatutoryRule.findMany({
        where: {
          organizationId: context.organizationId,
          ...(jurisdiction ? { jurisdiction } : {}),
        },
        orderBy: [{ jurisdiction: 'asc' }, { schemeCode: 'asc' }, { effectiveFrom: 'desc' }],
      }),
    );
  }

  async saveStatutoryRule(context: DomainContext, input: StatutoryRuleInput) {
    requirePermission(context, 'payroll.policy.write');
    validateStatutoryRule(input);
    const effectiveFrom = dateOnly(input.effectiveFrom);
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollStatutoryRule.findUnique({
        where: {
          organizationId_schemeCode_jurisdiction_effectiveFrom: {
            organizationId: context.organizationId,
            schemeCode: input.schemeCode.trim().toUpperCase(),
            jurisdiction: input.jurisdiction.trim().toUpperCase(),
            effectiveFrom,
          },
        },
      });
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Statutory rule end must not precede its start');
      const overlap = await tx.payrollStatutoryRule.findFirst({
        where: {
          organizationId: context.organizationId,
          schemeCode: input.schemeCode.trim().toUpperCase(),
          jurisdiction: input.jurisdiction.trim().toUpperCase(),
          ...(existing ? { id: { not: existing.id } } : {}),
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Statutory rule periods must not overlap');
      const data = {
        schemeCode: input.schemeCode.trim().toUpperCase(),
        jurisdiction: input.jurisdiction.trim().toUpperCase(),
        effectiveTo,
        employeeRate:
          input.employeeRate === undefined ? null : new Prisma.Decimal(input.employeeRate),
        employerRate:
          input.employerRate === undefined ? null : new Prisma.Decimal(input.employerRate),
        wageCeiling: input.wageCeiling === undefined ? null : new Prisma.Decimal(input.wageCeiling),
        employeeThreshold:
          input.employeeThreshold === undefined
            ? null
            : new Prisma.Decimal(input.employeeThreshold),
        flatAmount: input.flatAmount === undefined ? null : new Prisma.Decimal(input.flatAmount),
        metadata: jsonSnapshot(input.metadata ?? {}),
      };
      return existing
        ? tx.payrollStatutoryRule.update({ where: { id: existing.id }, data })
        : tx.payrollStatutoryRule.create({
            data: { organizationId: context.organizationId, effectiveFrom, ...data },
          });
    });
  }

  async deleteStatutoryRule(context: DomainContext, ruleId: string) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      const existing = await tx.payrollStatutoryRule.findFirst({
        where: { id: ruleId, organizationId: context.organizationId },
      });
      if (!existing) throw new NotFoundError('Statutory rule');
      await tx.payrollStatutoryRule.delete({ where: { id: existing.id } });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_STATUTORY_RULE',
          entityId: existing.id,
          action: 'PAYROLL_STATUTORY_RULE_DELETED',
          beforeState: jsonSnapshot(existing),
        },
        tx,
      );
      return { id: existing.id, deleted: true };
    });
  }
}
