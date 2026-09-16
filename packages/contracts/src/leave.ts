import { z } from 'zod';

/**
 * Leave shapes, matching what `LeaveService` returns.
 *
 * Amounts are Prisma `Decimal`, which serialises as a string, so every numeric field is coerced.
 * A balance rendered as `NaN` or blank would read as "no entitlement", which is the wrong answer
 * to show someone deciding whether they can take a day off.
 */

export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  paid: z.boolean(),
  accrualType: z.string(),
  annualAllowance: z.coerce.number().nullable().optional(),
  monthlyAccrual: z.coerce.number().nullable().optional(),
  carryoverLimit: z.coerce.number().nullable().optional(),
  requiresAttachment: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const leaveBalanceSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  // The model has no single "entitled" column: entitlement for a period is the opening balance
  // carried in plus what has accrued. See `entitlementOf`.
  openingAmount: z.coerce.number(),
  accruedAmount: z.coerce.number(),
  usedAmount: z.coerce.number(),
  reservedAmount: z.coerce.number(),
  availableAmount: z.coerce.number(),
  version: z.number().optional(),
  leaveType: leaveTypeSchema.optional(),
});

export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  requestedDays: z.coerce.number(),
  status: z.string(),
  reason: z.string().nullable().optional(),
  version: z.number().optional(),
  externalEmployeeId: z.string().nullable().optional(),
});

export const leaveRequestPageSchema = z.object({
  requests: z.array(leaveRequestSchema),
  nextCursor: z.string().optional(),
});

export const leaveAssignmentSchema = z.object({
  id: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  leaveTypeId: z.string().uuid().optional(),
  leaveType: leaveTypeSchema.optional(),
});

export type LeaveType = z.infer<typeof leaveTypeSchema>;
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;
export type LeaveAssignment = z.infer<typeof leaveAssignmentSchema>;

function parse<T>(schema: z.ZodType<T>, payload: unknown): T | null {
  const result = schema.safeParse(payload);
  return result.success ? result.data : null;
}

function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parseLeaveTypeList = (payload: unknown) => parseList(leaveTypeSchema, payload);
export const parseLeaveBalanceList = (payload: unknown) => parseList(leaveBalanceSchema, payload);
export const parseLeaveAssignmentList = (payload: unknown) =>
  parseList(leaveAssignmentSchema, payload);
export const parseLeaveRequestPage = (payload: unknown) => parse(leaveRequestPageSchema, payload);
export const parseLeaveRequest = (payload: unknown) => parse(leaveRequestSchema, payload);

/**
 * The approval inbox returns requests wrapped with their pending step, so it is parsed loosely:
 * only the fields the queue renders are required, and an unexpected extra shape is tolerated
 * rather than failing the whole list.
 */
export const leaveInboxEntrySchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  requestedDays: z.coerce.number().optional(),
  status: z.string().optional(),
  reason: z.string().nullable().optional(),
});

export type LeaveInboxEntry = z.infer<typeof leaveInboxEntrySchema>;

export const parseLeaveInbox = (payload: unknown) => {
  // The inbox may answer with a bare array or a `{ requests }` envelope.
  const items = Array.isArray(payload)
    ? payload
    : ((payload as { requests?: unknown } | null)?.requests ?? payload);
  const result = z.array(leaveInboxEntrySchema).safeParse(items);
  return result.success ? result.data : null;
};

/** `YYYY-MM-DD`, whatever precision the API sent. */
export function dateKey(value: string): string {
  return value.slice(0, 10);
}

/**
 * Total entitlement for the period: the balance carried in plus what has accrued.
 *
 * There is no `entitledAmount` column, so this is the only correct way to state the total, and
 * inventing a different denominator would make the progress bar disagree with the ledger.
 */
export function entitlementOf(balance: LeaveBalance): number {
  return balance.openingAmount + balance.accruedAmount;
}

/**
 * What the employee can still take.
 *
 * `availableAmount` is the server's own figure — reserved days are already excluded from it — so
 * it is used directly rather than recomputed from entitled minus used, which would double-count
 * a pending request.
 */
export function availableDays(balance: LeaveBalance): number {
  return balance.availableAmount;
}

/** A request that has not been decided yet, and so may still be cancelled. */
export function isPending(request: Pick<LeaveRequest, 'status'>): boolean {
  return request.status === 'PENDING';
}

/**
 * Requests the backend allows cancelling.
 *
 * `LeaveService.cancel` accepts PENDING and APPROVED with no date restriction, so this mirrors
 * that exactly. An earlier draft also required the leave not to have started; that rule exists
 * nowhere in the backend, and enforcing it here would have hidden a cancellation the API would
 * have accepted.
 */
export function isCancellable(request: Pick<LeaveRequest, 'status'>): boolean {
  return request.status === 'PENDING' || request.status === 'APPROVED';
}
