import { z } from 'zod';

export const externalIdSchema = z.string().uuid();

export const federationHeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
  'x-correlation-id': z.string().min(1).max(128),
  'idempotency-key': z.string().min(16).max(255).optional(),
  'x-federation-action-assertion': z.string().min(1).optional(),
});

export const tenantProvisioningRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  status: z.enum(['active', 'suspended']).default('active'),
});

export const employeeSyncRequestSchema = z.object({
  externalOrganizationId: externalIdSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(['active', 'inactive', 'terminated']),
  employmentType: z.string().trim().max(80).optional(),
  dateOfJoining: z.coerce.date().optional(),
});

export const federationEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  businessDate: z.string().date().optional(),
  externalOrganizationId: externalIdSchema,
  externalBranchId: externalIdSchema.nullable().optional(),
  data: z.record(z.string(), z.unknown()),
});

export type EmployeeSyncRequest = z.infer<typeof employeeSyncRequestSchema>;
export type FederationEventEnvelope = z.infer<typeof federationEventEnvelopeSchema>;
