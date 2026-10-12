import { z } from 'zod';

/**
 * Approval policies, matching what `ApprovalsService` returns.
 *
 * A policy is the routing rule for one domain: which approvers, in which order. It is not the
 * approval itself — a decision is taken through the owning module's own endpoint (leave requests,
 * attendance corrections, timesheets, payroll runs), which is where the server checks whether the
 * caller may approve.
 */

export const approvalDomainSchema = z.enum([
  'LEAVE',
  'ATTENDANCE_CORRECTION',
  'TIMESHEET',
  'PAYROLL',
]);

export const approverTypeSchema = z.enum(['ROLE', 'USER', 'MANAGER', 'EMPLOYEE']);

export const approvalAutomationSchema = z.object({
  mode: z.enum(['MANUAL', 'AUTOMATIC', 'CONDITIONAL']).default('MANUAL'),
  branchIds: z.array(z.string().uuid()).max(100).default([]),
  leaveTypeIds: z.array(z.string().uuid()).max(100).default([]),
  effectiveOn: z.string().date().optional(),
  maxLeaveDays: z.number().int().min(1).max(366).optional(),
  minNoticeDays: z.number().int().min(0).max(365).optional(),
  maxCorrectionAgeDays: z.number().int().min(0).max(90).optional(),
  maxChangedMinutes: z.number().int().min(0).max(120).optional(),
  maxCorrectionsPerMonth: z.number().int().min(1).max(31).optional(),
});
export type ApprovalAutomation = z.infer<typeof approvalAutomationSchema>;

export const approvalAutomationPreviewSchema = z.object({
  processed: z.number(),
  eligible: z.number(),
  manual: z.number(),
  nextCursor: z.string().nullable(),
  examples: z.array(z.object({ id: z.string(), eligible: z.boolean(), reason: z.string() })),
});
export type ApprovalAutomationPreviewResult = z.infer<typeof approvalAutomationPreviewSchema>;

export const approvalExceptionsSchema = z.object({
  checked: z.number(),
  nextCursor: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      domain: z.enum(['LEAVE', 'ATTENDANCE_CORRECTION']),
      requester: z.string(),
      stepNumber: z.number(),
      reason: z.string(),
    }),
  ),
});
export type ApprovalException = z.infer<typeof approvalExceptionsSchema>['items'][number];

export const approvalStepSchema = z.object({
  id: z.string().uuid().optional(),
  stepNumber: z.number(),
  approverType: approverTypeSchema,
  roleId: z.string().uuid().nullable().optional(),
  approverUserId: z.string().uuid().nullable().optional(),
  approverName: z.string().optional(),
  required: z.boolean().optional(),
});

export const approvalPolicySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  domain: approvalDomainSchema,
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  steps: z.array(approvalStepSchema),
  automation: approvalAutomationSchema.optional(),
});

export type ApprovalDomain = z.infer<typeof approvalDomainSchema>;
export type ApproverType = z.infer<typeof approverTypeSchema>;
export type ApprovalStep = z.infer<typeof approvalStepSchema>;
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parseApprovalPolicyList = (payload: unknown) =>
  parseList(approvalPolicySchema, payload);

export function parseApprovalPolicy(payload: unknown): ApprovalPolicy | null {
  const result = approvalPolicySchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The label a domain is shown under. The enum is the backend's; this is only presentation. */
export const approvalDomainLabel: Record<ApprovalDomain, string> = {
  LEAVE: 'Leave',
  ATTENDANCE_CORRECTION: 'Attendance correction',
  TIMESHEET: 'Timesheet',
  PAYROLL: 'Payroll',
};
