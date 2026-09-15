import { z } from 'zod';

/**
 * Shifts, matching what `ShiftsService` returns.
 *
 * A shift is working-time configuration: which days, from when to when, and how much of it is
 * break. Attendance prices a punch against it, so nothing here is decorative — but note that the
 * shift does not currently reach payroll, which prorates against a flat day basis.
 */

export const breakRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  durationMinutes: z.number(),
  isPaid: z.boolean(),
  sequence: z.number(),
});

export const shiftSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  code: z.string(),
  name: z.string(),
  /** ISO weekday numbers, 1 (Monday) through 7 (Sunday). */
  daysOfWeek: z.array(z.number()),
  startsAt: z.string(),
  endsAt: z.string(),
  crossesMidnight: z.boolean(),
  breakMinutes: z.number(),
  isActive: z.boolean().optional(),
  breakRules: z.array(breakRuleSchema).optional(),
});

export type BreakRule = z.infer<typeof breakRuleSchema>;
export type Shift = z.infer<typeof shiftSchema>;

function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parseShiftList = (payload: unknown) => parseList(shiftSchema, payload);

export function parseShift(payload: unknown): Shift | null {
  const result = shiftSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The shift an employee is assigned to on a day, or null when they have none. */
export const currentShiftAssignmentSchema = z.object({
  assignment: z
    .object({
      id: z.string().uuid(),
      employeeId: z.string().uuid(),
      startsOn: z.string(),
      endsOn: z.string().nullable(),
      shift: shiftSchema,
    })
    .nullable(),
});
export type CurrentShiftAssignment = z.infer<typeof currentShiftAssignmentSchema>['assignment'];

export function parseCurrentShiftAssignment(payload: unknown) {
  const result = currentShiftAssignmentSchema.safeParse(payload);
  return result.success ? result.data : null;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** `Mon, Tue, Wed` — presentation only; the numbers are the backend's. */
export function formatWeekdays(daysOfWeek: number[]): string {
  if (daysOfWeek.length === 0) return 'No days';
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day - 1] ?? String(day))
    .join(', ');
}

/**
 * Scheduled minutes for one occurrence of the shift, break excluded.
 *
 * This is a restatement of the shift's own configured times for display — not a pay figure and
 * not an attendance figure, both of which the backend computes from real punches.
 */
export function shiftMinutes(
  shift: Pick<Shift, 'startsAt' | 'endsAt' | 'crossesMidnight' | 'breakMinutes'>,
): number {
  const toMinutes = (value: string) => {
    const [hours = '0', minutes = '0'] = value.split(':');
    return Number(hours) * 60 + Number(minutes);
  };
  const start = toMinutes(shift.startsAt);
  const end = toMinutes(shift.endsAt);
  const span = shift.crossesMidnight ? end + 24 * 60 - start : end - start;
  return Math.max(0, span - shift.breakMinutes);
}
