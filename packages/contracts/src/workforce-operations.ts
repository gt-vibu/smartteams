import { z } from 'zod';
export const workforceOperationSchema = z.enum([
  'PAYROLL_POLICY',
  'SALARY',
  'SHIFT',
  'MANAGER',
  'LEAVE_POLICY',
]);
export type WorkforceOperation = z.infer<typeof workforceOperationSchema>;
const option = z.object({ id: z.string().uuid(), name: z.string() });
export const workforceOptionsSchema = z.object({
  branches: z.array(option),
  departments: z.array(option),
  roles: z.array(option),
  targets: z.array(option),
  today: z.string(),
});
export const workforcePeopleSchema = z.object({
  total: z.number().int(),
  items: z.array(option.extend({ employeeNumber: z.string(), branchName: z.string().nullable() })),
  nextCursor: z.string().nullable(),
});
export const workforceSalarySchema = z.object({
  grossSalary: z.number().positive().max(100000000),
  pfEnabled: z.boolean(), esiEnabled: z.boolean(), ptEnabled: z.boolean(),
});
export const workforceFilterSchema = z.object({
  branchIds: z.array(z.string().uuid()).max(1000).optional(),
  branchId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
  departmentId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  search: z.string().optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  excludeEmployeeIds: z.array(z.string().uuid()).max(10000).optional(),
  allEmployees: z.boolean().optional(),
});
export type WorkforceInput = {
  operation: WorkforceOperation;
  salary?: z.infer<typeof workforceSalarySchema>;
  targetId: string;
  effectiveFrom: string;
  reason: string;
  filter: z.infer<typeof workforceFilterSchema>;
};
export const workforcePreviewSchema = z.object({
  total: z.number(),
  affectedEmployees: z.number(),
  valid: z.number(),
  invalid: z.number(),
  targetName: z.string(),
  fingerprint: z.string(),
  targetRevision: z.string(),
  rows: z.array(
    option.extend({ revision: z.string(), error: z.string().nullable(), affected: z.number() }),
  ),
  impact: z
    .object({
      from: z.string(),
      to: z.string(),
      leaveRequests: z.number(),
      attendanceRecords: z.number(),
    })
    .nullable(),
});
export const workforceJobSchema = z.object({
  batchId: z.string().uuid(),
  state: z.string(),
  operation: workforceOperationSchema,
  total: z.number(),
  processed: z.number(),
  applied: z.number(),
  failed: z.number(),
  results: z.array(option.extend({ outcome: z.enum(['APPLIED', 'FAILED']), message: z.string() })),
  nextOffset: z.number().nullable(),
  error: z.string().nullable(),
});
export type WorkforceJobState = z.infer<typeof workforceJobSchema>;
export type WorkforcePreview = z.infer<typeof workforcePreviewSchema>;

export const workforceInputSchema = z.object({
  salary: workforceSalarySchema.optional(),
  operation: workforceOperationSchema,
  targetId: z.string().uuid(),
  effectiveFrom: z.string(),
  reason: z.string(),
  filter: workforceFilterSchema,
});
export const workforceRetrySchema = z.object({
  input: workforceInputSchema,
  preview: workforcePreviewSchema,
});

export const employeeDirectorySummarySchema = z.object({
  jobTitles: z.array(z.string()),
  active: z.number().int().nonnegative(), former: z.number().int().nonnegative(),
  managers: z.number().int().nonnegative(),
  withoutManager: z.number().int().nonnegative(), withoutLogin: z.number().int().nonnegative(),
  departments: z.array(z.object({ id: z.string(), name: z.string() })),
});
