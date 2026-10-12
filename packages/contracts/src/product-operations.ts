import { z } from 'zod';
import { leaveCancellationSchema } from './leave-workflows';
export const cancellationInboxSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      leaveType: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      cancellation: leaveCancellationSchema,
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const payrollReadinessSchema = z.object({
  ready: z.boolean(),
  blockers: z.array(
    z.object({ code: z.string(), count: z.number(), message: z.string(), module: z.string() }),
  ),
  conflicts: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string().optional(),
      attendanceRecordId: z.string(),
      workDate: z.string(),
    }),
  ),
  missingPay: z.array(z.object({ id: z.string(), name: z.string(), employeeNumber: z.string() })),
});
export const employeeReadinessSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      employeeNumber: z.string(),
      name: z.string(),
      issues: z.array(z.object({ code: z.string(), message: z.string(), module: z.string() })),
      usingOrganizationCalendar: z.boolean(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const employeeBulkPreviewSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.number(),
      error: z.string().nullable(),
    }),
  ),
  fingerprint: z.string(),
  valid: z.number(),
  invalid: z.number(),
});
export const employeeBulkResultSchema = z.object({
  results: z.array(
    z.object({ id: z.string(), name: z.string(), outcome: z.string(), message: z.string() }),
  ),
});
export type EmployeeBulkInput = {
  kind: 'MANAGER' | 'SHIFT';
  employeeIds: string[];
  targetId: string;
  startsOn?: string;
  reason: string;
  fingerprint?: string;
};

export const existingAutomationResultSchema = z.object({
  approved: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      id: z.string().uuid(),
      outcome: z.enum(['APPROVED', 'SKIPPED']),
      message: z.string(),
    }),
  ),
});

export const approverSearchSchema = z.object({
  items: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string(),
      employeeNumber: z.string(),
      branchName: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const approvalAnalyticsSchema = z.object({
  generatedAt: z.string(),
  since: z.string(),
  escalationDays: z.number(),
  rows: z.array(
    z.object({
      domain: z.enum(['LEAVE', 'ATTENDANCE_CORRECTION']),
      pending: z.number(),
      overdue: z.number(),
      oldestAt: z.string().nullable(),
      automatic: z.number(),
      manual: z.number(),
    }),
  ),
});

export const approvalBatchHistorySchema = z.object({
  items: z.array(
    z.object({
      batchId: z.string().uuid(),
      createdAt: z.string(),
      state: z.string(),
      total: z.number(),
      processed: z.number(),
      failed: z.number(),
      error: z.string().nullable(),
    }),
  ),
  nextOffset: z.number().nullable(),
});
