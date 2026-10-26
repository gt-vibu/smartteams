import { z } from 'zod';
export const leaveSessionSchema = z.enum(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF']);
export type LeaveSession = z.infer<typeof leaveSessionSchema>;
export const leaveCancellationSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  reason: z.string(),
  requestedAt: z.string(),
  requestedByUserId: z.string(),
  reviewedAt: z.string().optional(),
  reviewedByUserId: z.string().optional(),
  reviewReason: z.string().optional(),
});
export const leaveWorkflowSettingsSchema = z.object({
  futureCancellation: z.enum(['IMMEDIATE', 'REVIEW', 'DISABLED']).default('IMMEDIATE'),
  minimumNoticeDays: z.number().int().min(0).max(365).default(0),
  startedCancellation: z.enum(['REVIEW', 'DISABLED']).default('REVIEW'),
});
export type LeaveWorkflowSettings = z.infer<typeof leaveWorkflowSettingsSchema>;
