import { z } from 'zod';

export const externalIdSchema = z.string().trim().min(1).max(255);

export const federationHeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
  'x-correlation-id': z.string().min(1).max(128).optional(),
  'x-client-certificate-fingerprint': z.string().trim().min(1).max(255),
  'idempotency-key': z.string().min(16).max(255).optional(),
  'x-federation-action-assertion': z.string().min(1).optional(),
});

export const tenantProvisioningRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

export const employeeSyncRequestSchema = z.object({
  externalId: externalIdSchema.optional(),
  employeeNumber: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().min(1).max(100),
  preferredName: z.string().trim().max(100).optional(),
  workEmail: z.string().email().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
  employmentType: z.string().trim().max(80).optional(),
  dateOfJoining: z.string().date().optional(),
  primaryBranchId: z.string().uuid().optional(),
  externalVersion: z.string().trim().max(255).optional(),
});

export const federationEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  correlationId: z.string().min(1),
  schemaVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type EmployeeSyncRequest = z.infer<typeof employeeSyncRequestSchema>;
export type FederationEventEnvelope = z.infer<typeof federationEventEnvelopeSchema>;
