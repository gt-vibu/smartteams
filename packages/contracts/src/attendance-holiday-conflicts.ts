import { z } from 'zod';

/**
 * A check-in on a granted optional holiday, and where its resolution stands.
 *
 * The API derives the state from the holiday selection, the attendance record and the review, so
 * the client never infers it. `AWAITING_REASON` and `AWAITING_DECISION` are unresolved; the other
 * two are a manager's decision.
 */
export const holidayConflictStates = [
  'AWAITING_REASON',
  'AWAITING_DECISION',
  'HOLIDAY_KEPT',
  'CONVERTED_TO_WORKING_DAY',
] as const;
export type HolidayConflictState = (typeof holidayConflictStates)[number];

export const holidayReviewOutcomes = ['KEEP_HOLIDAY', 'CONVERT_TO_WORKING_DAY'] as const;
export type HolidayReviewOutcome = (typeof holidayReviewOutcomes)[number];

const conflictPunchSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  occurredAt: z.string(),
});

const conflictAttendanceSchema = z.object({
  status: z.string(),
  workedMinutes: z.number(),
  overtimeMinutes: z.number(),
  punches: z.array(conflictPunchSchema),
});

const conflictEmployeeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string().nullable().optional(),
  employeeNumber: z.string().nullable().optional(),
});

const conflictHolidaySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  date: z.string(),
});

export const holidayConflictSchema = z.object({
  attendanceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  employee: conflictEmployeeSchema.optional(),
  workDate: z.string(),
  selectionId: z.string().uuid(),
  holiday: conflictHolidaySchema,
  state: z.enum(holidayConflictStates),
  attendance: conflictAttendanceSchema,
  review: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      outcome: z.enum(holidayReviewOutcomes).nullable(),
      reason: z.string(),
      comment: z.string().nullable(),
      decisionComment: z.string().nullable(),
      decidedAt: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});

export const holidayReviewInboxItemSchema = z.object({
  id: z.string().uuid(),
  attendanceId: z.string().uuid(),
  workDate: z.string(),
  holiday: conflictHolidaySchema,
  employee: conflictEmployeeSchema,
  reason: z.string(),
  comment: z.string().nullable(),
  createdAt: z.string(),
  attendance: conflictAttendanceSchema,
});

export const holidayReviewDecisionSchema = z.object({
  result: z.enum(['KEEP_HOLIDAY', 'CONVERT_TO_WORKING_DAY', 'NO_LONGER_IN_CONFLICT']),
  payroll: z
    .object({
      markedStale: z.number(),
      finalizedRuns: z.array(z.object({ id: z.string(), status: z.string() })),
    })
    .optional(),
});

export type HolidayConflict = z.infer<typeof holidayConflictSchema>;
export type HolidayReviewInboxItem = z.infer<typeof holidayReviewInboxItemSchema>;
export type HolidayReviewDecision = z.infer<typeof holidayReviewDecisionSchema>;

function parse<T>(schema: z.ZodType<T>, payload: unknown): T | null {
  const result = schema.safeParse(payload);
  return result.success ? result.data : null;
}

export const parseHolidayConflicts = (payload: unknown) =>
  parse(z.object({ conflicts: z.array(holidayConflictSchema) }), payload)?.conflicts ?? null;
export const parseHolidayReviewInbox = (payload: unknown) =>
  parse(z.object({ reviews: z.array(holidayReviewInboxItemSchema) }), payload)?.reviews ?? null;
export const parseHolidayReviewDecision = (payload: unknown) =>
  parse(holidayReviewDecisionSchema, payload);
/** The conflict a native check-in created, if any, from the check-in reply. */
export const parseCheckInHolidayConflict = (payload: unknown) =>
  parse(z.object({ holidayConflict: holidayConflictSchema.nullable() }), payload)
    ?.holidayConflict ?? null;
