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

/**
 * Freezes a record into the JSON the audit log stores.
 *
 * `JSON.stringify` throws outright on a BigInt rather than skipping it, and three columns in this
 * schema are BigInt — `FileObject.byteSize`, `FileObjectVersion.byteSize` and
 * `WebauthnCredential.signCount`. Auditing any of those rows crashed the whole request with
 * "Do not know how to serialize a BigInt", which is how file upload came to be broken on a path
 * nothing exercised: without object storage configured it failed earlier, for a different reason,
 * and the real fault stayed hidden.
 *
 * BigInt is written as a decimal string. It is an identifier or a byte count, never arithmetic
 * the log performs, and a string survives the round trip exactly where `Number` would silently
 * lose precision above 2^53.
 */
export function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === 'bigint' ? entry.toString() : entry,
    ),
  ) as Prisma.InputJsonValue;
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
