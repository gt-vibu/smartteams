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

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1),
  instance: z.string().min(1),
  code: z.string().min(1).optional(),
  meta: z
    .object({
      requestId: z.string().min(1).optional(),
      correlationId: correlationIdSchema.optional(),
    })
    .optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export * from './auth';
export * from './workforce';
export * from './attendance';
export * from './attendance-holiday-conflicts';
export * from './leave';
export * from './timesheets';
export * from './payroll';
export * from './approvals';
export * from './shifts';
export * from './organization';
export * from './files';
export * from './holidays';
export * from './rbac';
