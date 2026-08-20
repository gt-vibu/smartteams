import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { createHash, createSign, createPublicKey, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { OutboxStatus, WebhookDeliveryStatus } from '../../generated/prisma/enums';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import type { DomainContext } from '../../common/context/domain-context';
import { assertSafeWebhookUrl } from '../../common/security/url-safety';
import type { Queue } from 'bullmq';

@Injectable()
export class WebhookService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    @InjectQueue('webhook-delivery') private readonly queue: Queue,
  ) {}

  signingKeys() {
    const publicKey = this.publicKey();
    return {
      keys: [
        {
          keyId: this.config.getOrThrow<string>('FEDERATION_WEBHOOK_SIGNING_KEY_ID'),
          algorithm: 'RSA-SHA256',
          publicKeyPem: publicKey,
          status: 'ACTIVE',
        },
      ],
    };
  }

  async subscribe(
    context: DomainContext,
    clientId: string,
    input: { callbackUrl: string; eventTypes: string[] },
  ) {
    if (!context.actor.clientId || context.actor.clientId !== clientId)
      throw new ConflictError(
        'Webhook subscription client does not match the authenticated federation client',
      );
    const callbackUrl = await assertSafeWebhookUrl(
      input.callbackUrl,
      this.config.getOrThrow<string>('FEDERATION_WEBHOOK_ALLOWED_HOSTS').split(','),
    );
    return this.database.run(context, async (tx) => {
      const key = await tx.webhookSigningKey.upsert({
        where: {
          clientId_keyId: {
            clientId,
            keyId: this.config.getOrThrow<string>('FEDERATION_WEBHOOK_SIGNING_KEY_ID'),
          },
        },
        create: {
          clientId,
          keyId: this.config.getOrThrow<string>('FEDERATION_WEBHOOK_SIGNING_KEY_ID'),
          secretRef: 'env:FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM',
          algorithm: 'RSA-SHA256',
          status: 'ACTIVE',
          validFrom: new Date(),
        },
        update: {},
      });
      const subscription = await tx.webhookSubscription.upsert({
        where: {
          clientId_organizationId_callbackUrl: {
            clientId,
            organizationId: context.organizationId,
            callbackUrl,
          },
        },
        create: {
          clientId,
          organizationId: context.organizationId,
          callbackUrl,
          eventTypes: input.eventTypes,
          signingKeyId: key.id,
        },
        update: {
          eventTypes: input.eventTypes,
          status: 'ACTIVE',
          revokedAt: null,
          signingKeyId: key.id,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'WEBHOOK_SUBSCRIPTION',
          entityId: subscription.id,
          action: 'WEBHOOK_SUBSCRIPTION_CREATED',
          afterState: jsonSnapshot(subscription),
        },
        tx,
      );
      return subscription;
    });
  }

  async replay(context: DomainContext, cursor: string | undefined, limit = 100) {
    const decoded = cursor ? this.decodeCursor(cursor) : undefined;
    const events = await this.database.run(context, (tx) =>
      tx.outboxEvent.findMany({
        where: {
          organizationId: context.organizationId,
          ...(decoded
            ? {
                OR: [
                  { createdAt: { gt: decoded.createdAt } },
                  { createdAt: decoded.createdAt, id: { gt: decoded.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: Math.min(limit, 500),
      }),
    );
    const last = events.at(-1);
    return {
      events: events.map((event) => this.eventDto(event)),
      nextCursor: last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : undefined,
    };
  }

  async replayDelivery(context: DomainContext, deliveryId: string) {
    return this.database.run(context, async (tx) => {
      const delivery = await tx.webhookDelivery.findFirst({
        where: { id: deliveryId, organizationId: context.organizationId },
      });
      if (!delivery) throw new NotFoundError('Webhook delivery');
      const updated = await tx.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.REPLAY_REQUESTED,
          replayRequestedAt: new Date(),
          nextAttemptAt: new Date(),
        },
      });
      return updated;
    });
  }

  sign(body: string, requestId: string, timestamp: string) {
    const privateKey = this.config.get<string>('FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM');
    if (!privateKey) throw new ConflictError('Federation webhook private key is not configured');
    return {
      signature: signWebhookPayload(privateKey, body, timestamp),
      requestId,
      bodyHash: createHash('sha256').update(body).digest('hex'),
    };
  }

  async deliver(deliveryId: string) {
    const delivery = await this.database.runSystem(undefined, (tx) =>
      tx.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { outboxEvent: true, subscription: true },
      }),
    );
    if (!delivery || !['PENDING', 'REPLAY_REQUESTED'].includes(delivery.status)) return;
    try {
      await assertSafeWebhookUrl(
        delivery.subscription.callbackUrl,
        this.config.getOrThrow<string>('FEDERATION_WEBHOOK_ALLOWED_HOSTS').split(','),
      );
    } catch {
      await this.database.runSystem(undefined, (tx) =>
        tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: WebhookDeliveryStatus.DEAD_LETTERED },
        }),
      );
      return;
    }
    if (delivery.attemptCount >= 8) {
      await this.database.runSystem(undefined, (tx) =>
        tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: WebhookDeliveryStatus.DEAD_LETTERED },
        }),
      );
      return;
    }
    const body = JSON.stringify({
      eventId: delivery.outboxEvent.eventId,
      eventType: delivery.outboxEvent.eventType,
      schemaVersion: delivery.outboxEvent.schemaVersion,
      occurredAt: delivery.outboxEvent.createdAt.toISOString(),
      correlationId: delivery.outboxEvent.correlationId,
      payload: delivery.outboxEvent.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signed = this.sign(body, randomUUID(), timestamp);
    const attemptNumber = delivery.attemptCount + 1;
    await this.database.runSystem(undefined, async (tx) => {
      await tx.webhookDeliveryAttempt.create({
        data: {
          deliveryId,
          attemptNumber,
          requestId: signed.requestId,
          signatureKeyId: this.config.getOrThrow<string>('FEDERATION_WEBHOOK_SIGNING_KEY_ID'),
          requestBodyHash: signed.bodyHash,
          startedAt: new Date(),
        },
      });
      await tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: WebhookDeliveryStatus.PROCESSING },
      });
    });
    try {
      const response = await fetch(delivery.subscription.callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-smarteam-signature': signed.signature,
          'x-smarteam-signature-algorithm': 'RSA-SHA256',
          'x-smarteam-key-id': this.config.getOrThrow<string>('FEDERATION_WEBHOOK_SIGNING_KEY_ID'),
          'x-smarteam-timestamp': timestamp,
          'x-smarteam-request-id': signed.requestId,
        },
        body,
        redirect: 'error',
      });
      const status = response.ok
        ? WebhookDeliveryStatus.DELIVERED
        : attemptNumber >= 8
          ? WebhookDeliveryStatus.DEAD_LETTERED
          : WebhookDeliveryStatus.FAILED;
      this.metrics.webhookDeliveryResults.inc({ result: response.ok ? 'delivered' : 'failed' });
      await this.database.runSystem(undefined, (tx) =>
        tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status,
            attemptCount: attemptNumber,
            lastHttpStatus: response.status,
            deliveredAt: response.ok ? new Date() : undefined,
            nextAttemptAt: new Date(Date.now() + 60_000),
          },
        }),
      );
      if (!response.ok && status === WebhookDeliveryStatus.FAILED)
        await this.queue.add(
          'deliver',
          { deliveryId },
          {
            jobId: `${deliveryId}:${attemptNumber + 1}`,
            delay: Math.min(3_600_000, 2 ** attemptNumber * 1_000),
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
    } catch {
      const status =
        attemptNumber >= 8 ? WebhookDeliveryStatus.DEAD_LETTERED : WebhookDeliveryStatus.FAILED;
      this.metrics.webhookDeliveryResults.inc({ result: 'error' });
      await this.database.runSystem(undefined, (tx) =>
        tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status,
            attemptCount: attemptNumber,
            nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 2 ** attemptNumber * 1_000)),
          },
        }),
      );
      if (status === WebhookDeliveryStatus.FAILED)
        await this.queue.add(
          'deliver',
          { deliveryId },
          {
            jobId: `${deliveryId}:${attemptNumber + 1}`,
            delay: Math.min(3_600_000, 2 ** attemptNumber * 1_000),
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
    }
  }

  async dispatchPending() {
    const deliveryIds = await this.database.runSystem(undefined, async (tx) => {
      const events = await tx.outboxEvent.findMany({
        where: { status: OutboxStatus.PENDING, nextAttemptAt: { lte: new Date() } },
        take: 100,
      });
      const ids: string[] = [];
      for (const event of events) {
        const subscriptions = await tx.webhookSubscription.findMany({
          where: {
            organizationId: event.organizationId,
            status: 'ACTIVE',
            eventTypes: { has: event.eventType },
          },
        });
        for (const subscription of subscriptions) {
          const delivery = await tx.webhookDelivery.upsert({
            where: {
              outboxEventId_subscriptionId: {
                outboxEventId: event.id,
                subscriptionId: subscription.id,
              },
            },
            create: {
              outboxEventId: event.id,
              subscriptionId: subscription.id,
              organizationId: event.organizationId,
              nextAttemptAt: new Date(),
            },
            update: {},
          });
          ids.push(delivery.id);
        }
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxStatus.READY },
        });
      }
      return ids;
    });
    await Promise.all(
      deliveryIds.map((deliveryId) =>
        this.queue.add(
          'deliver',
          { deliveryId },
          { jobId: `${deliveryId}:1`, attempts: 1, removeOnComplete: true, removeOnFail: true },
        ),
      ),
    );
  }

  private publicKey() {
    const configured = this.config.get<string>('FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM');
    if (configured) return configured;
    const privateKey = this.config.get<string>('FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM');
    if (!privateKey) throw new ConflictError('Federation webhook public key is not configured');
    return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  }
  private decodeCursor(cursor: string) {
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !value ||
        typeof value !== 'object' ||
        !('createdAt' in value) ||
        !('id' in value) ||
        typeof value.createdAt !== 'string' ||
        typeof value.id !== 'string'
      )
        throw new Error();
      return { createdAt: new Date(value.createdAt), id: value.id };
    } catch {
      throw new ConflictError('Invalid federation replay cursor');
    }
  }
  private eventDto(event: {
    eventId: string;
    eventType: string;
    schemaVersion: string;
    payload: Prisma.JsonValue;
    correlationId: string;
    createdAt: Date;
  }) {
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      payload: event.payload,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    };
  }
}

export function signWebhookPayload(privateKey: string, body: string, timestamp: string) {
  const signer = createSign('RSA-SHA256');
  signer.update(`${timestamp}.${body}`);
  signer.end();
  return signer.sign(privateKey, 'base64');
}
