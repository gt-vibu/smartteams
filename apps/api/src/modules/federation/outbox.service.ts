import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { DomainContext } from '../../common/context/domain-context';

export type OutboxInput = {
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  payload: Prisma.InputJsonValue;
  causationId?: string;
};

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    context: DomainContext,
    input: OutboxInput,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const eventId = randomUUID();
    return tx.outboxEvent.create({
      data: {
        eventId,
        organizationId: context.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        aggregateVersion: input.aggregateVersion,
        eventType: input.eventType,
        schemaVersion: 'v1',
        payload: input.payload,
        correlationId: context.correlationId,
        causationId: input.causationId,
      },
    });
  }
}
