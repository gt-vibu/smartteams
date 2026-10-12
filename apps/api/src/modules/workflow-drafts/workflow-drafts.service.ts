import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptEmployeeSecret, encryptEmployeeSecret } from '../employees/employee-sensitive-data';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { SaveWorkflowDraftDto } from './workflow-drafts.dto';

const permissions: Record<string, string> = {
  EMPLOYEE_ONBOARDING: 'employees.write',
  PAYROLL_RUN_FORM: 'payroll.runs.write',
  PAYROLL_POLICY: 'payroll.policy.write',
  PAYROLL_COMPONENT: 'payroll.components.write',
  PAYROLL_SALARY: 'payroll.employee-profile.write',
};

@Injectable()
export class WorkflowDraftsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly config: ConfigService,
  ) {}

  async list(context: DomainContext, kind?: string) {
    if (kind) this.authorize(context, kind);
    else requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const rows = await tx.workflowDraft.findMany({
        where: {
          organizationId: context.organizationId,
          ownerUserId: context.actor.userId!,
          ...(kind ? { kind } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        payload: JSON.parse(
          decryptEmployeeSecret(this.config, row.payloadEncrypted) ?? '{}',
        ) as Record<string, unknown>,
        updatedAt: row.updatedAt.toISOString(),
      }));
    });
  }

  async save(context: DomainContext, input: SaveWorkflowDraftDto) {
    this.authorize(context, input.kind);
    const serialized = JSON.stringify(input.payload);
    if (Buffer.byteLength(serialized, 'utf8') > 100_000)
      throw new ConflictError('Draft is too large to save');
    const title = input.title.trim().slice(0, 160);
    if (!title) throw new ConflictError('Give this draft a name');
    return this.database.run(context, async (tx) => {
      const row = await tx.workflowDraft.upsert({
        where: {
          organizationId_ownerUserId_kind: {
            organizationId: context.organizationId,
            ownerUserId: context.actor.userId!,
            kind: input.kind,
          },
        },
        create: {
          organizationId: context.organizationId,
          ownerUserId: context.actor.userId!,
          kind: input.kind,
          title,
          payloadEncrypted: encryptEmployeeSecret(this.config, serialized),
        },
        update: { title, payloadEncrypted: encryptEmployeeSecret(this.config, serialized) },
        select: { id: true, kind: true, title: true, updatedAt: true },
      });
      return { ...row, updatedAt: row.updatedAt.toISOString() };
    });
  }

  async remove(context: DomainContext, id: string) {
    return this.database.run(context, async (tx) => {
      const row = await tx.workflowDraft.findFirst({
        where: { id, organizationId: context.organizationId, ownerUserId: context.actor.userId! },
        select: { id: true, kind: true },
      });
      if (!row) return { deleted: false };
      this.authorize(context, row.kind);
      await tx.workflowDraft.delete({ where: { id: row.id } });
      return { deleted: true };
    });
  }

  private authorize(context: DomainContext, kind: string) {
    const permission = permissions[kind];
    if (!permission) throw new ConflictError('Unsupported draft type');
    requirePermission(context, permission);
  }
}
