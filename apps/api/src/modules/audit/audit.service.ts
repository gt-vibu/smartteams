import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';

export type AuditContext = Omit<DomainContext, 'organizationId'> & { organizationId?: string };

export type AuditRecordInput = {
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  reason?: string;
  branchId?: string;
};

export function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  async record(context: AuditContext, input: AuditRecordInput, tx: Prisma.TransactionClient) {
    return tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        branchId: input.branchId ?? context.branchId,
        actorType: context.actor.type,
        actorUserId: context.actor.userId,
        actorClientId: context.actor.clientId,
        accessMode: context.accessMode,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId: context.correlationId,
        requestId: context.requestId,
        beforeState: input.beforeState,
        afterState: input.afterState,
        reason: input.reason ?? context.reason,
      },
    });
  }
}
