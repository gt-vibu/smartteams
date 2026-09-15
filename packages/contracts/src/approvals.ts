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

export const approvalStepSchema = z.object({
  id: z.string().uuid().optional(),
  stepNumber: z.number(),
  approverType: approverTypeSchema,
  roleId: z.string().uuid().nullable().optional(),
  approverUserId: z.string().uuid().nullable().optional(),
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
