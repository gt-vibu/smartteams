import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

export type IdempotentResult = { status: number; body: unknown };

@Injectable()
export class FederationIdempotencyService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
  ) {}

  async execute<T>(
    clientId: string,
    organizationId: string | undefined,
    key: string | undefined,
    requestBody: unknown,
    operation: () => Promise<IdempotentResult & { value: T }>,
  ) {
    if (!key) return (await operation()).value;
    const persistedOrganizationId = organizationId
      ? await this.resolveOrganizationId(organizationId)
      : undefined;
    if (!persistedOrganizationId) {
      throw new ConflictError(
        'Federation mutations require a pre-registered organization and active grant',
      );
    }
    const requestHash = idempotencyRequestHash(requestBody);
    const expiresAt = new Date(Date.now() + 86_400_000);
    let record: { id: string };
    try {
      record = await this.database.runSystem(persistedOrganizationId, (tx) =>
        tx.federationIdempotencyRecord.create({
          data: {
            clientId,
            organizationId: persistedOrganizationId,
            idempotencyKey: key,
            requestHash,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            expiresAt,
          },
          select: { id: true },
        }),
      );
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      const existing = await this.database.runSystem(persistedOrganizationId, (tx) =>
        tx.federationIdempotencyRecord.findFirst({
          where: { clientId, organizationId: persistedOrganizationId, idempotencyKey: key },
        }),
      );
      if (!existing || existing.expiresAt <= new Date())
        throw new ConflictError('Idempotency key is expired or unavailable');
      if (existing.requestHash !== requestHash)
        throw new ConflictError('Idempotency key was already used with a different request');
      if (existing.status === 'COMPLETED' && existing.responseCiphertext && existing.responseStatus)
        return this.decode(existing.responseCiphertext).body as T;
      if (existing.status === 'FAILED') {
        const claimed = await this.database.runSystem(persistedOrganizationId, (tx) =>
          tx.federationIdempotencyRecord.updateMany({
            where: { id: existing.id, status: 'FAILED' },
            data: { status: 'IN_PROGRESS', startedAt: new Date(), completedAt: null },
          }),
        );
        if (claimed.count === 1) {
          record = { id: existing.id };
        } else {
          throw new ConflictError('An identical request is already in progress');
        }
      } else {
        throw new ConflictError('An identical request is already in progress');
      }
    }
    try {
      const result = await operation();
      await this.database.runSystem(persistedOrganizationId, (tx) =>
        tx.federationIdempotencyRecord.update({
          where: { id: record.id },
          data: {
            status: 'COMPLETED',
            responseStatus: result.status,
            responseCiphertext: this.encode(result),
            completedAt: new Date(),
            resourceId: isUuid(result.body) ? result.body : undefined,
          },
        }),
      );
      return result.value;
    } catch (error) {
      await this.database
        .runSystem(persistedOrganizationId, (tx) =>
          tx.federationIdempotencyRecord.update({
            where: { id: record.id },
            data: { status: 'FAILED', completedAt: new Date() },
          }),
        )
        .catch(() => undefined);
      throw error;
    }
  }

  private key() {
    const value = this.config.get<string>('FEDERATION_IDEMPOTENCY_ENCRYPTION_KEY');
    if (!value) throw new ConflictError('Federation idempotency encryption is not configured');
    return createHash('sha256').update(value).digest();
  }
  private async resolveOrganizationId(value: string) {
    return this.database.runSystem(undefined, (tx) =>
      tx.organization
        .findFirst({
          where: { OR: [{ externalId: value }, ...(isUuid(value) ? [{ id: value }] : [])] },
          select: { id: true },
        })
        .then((organization) => organization?.id),
    );
  }
  private encode(value: IdempotentResult) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }
  private decode(value: Uint8Array) {
    const buffer = Buffer.from(value);
    const decipher = createDecipheriv('aes-256-gcm', this.key(), buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8'),
    ) as IdempotentResult;
  }
}

export function idempotencyRequestHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function isUniqueError(error: unknown): error is { code: 'P2002' } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}
