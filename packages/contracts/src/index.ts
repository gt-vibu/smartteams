import { z } from 'zod';

export const correlationIdSchema = z.string().trim().min(1).max(128);
export const idempotencyKeySchema = z.string().trim().min(16).max(255);

export const apiMetaSchema = z.object({
  correlationId: correlationIdSchema,
  requestId: z.string().min(1),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
  meta: apiMetaSchema,
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  service: z.string(),
  version: z.string(),
  checks: z.record(
    z.string(),
    z.object({ status: z.enum(['up', 'down']), latencyMs: z.number().nonnegative().optional() }),
  ),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
