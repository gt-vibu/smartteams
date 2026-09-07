import { z } from 'zod';

/**
 * Holidays, matching what `HolidaysService` returns.
 *
 * A holiday is a date, a name, and an optional branch scope. Leave excludes an active one from
 * the working days a request is charged for, and payroll counts them into its working-day figure.
 * The model has no categories, regions or carry-forward rules, so neither does this.
 */

export const holidaySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  holidayDate: z.string(),
  name: z.string(),
  isOptional: z.boolean(),
  isActive: z.boolean(),
});

export type Holiday = z.infer<typeof holidaySchema>;

export const selectionStatusSchema = z.enum(['CONFIRMED', 'PENDING', 'REJECTED', 'CANCELLED']);
export type SelectionStatus = z.infer<typeof selectionStatusSchema>;

export const employeeHolidaySelectionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  holidayId: z.string().uuid(),
  year: z.number(),
  status: selectionStatusSchema,
  selectedAt: z.string(),
  cancelledAt: z.string().nullable().optional(),
  holiday: holidaySchema.optional(),
  employee: z
    .object({
      id: z.string().uuid(),
      employeeNumber: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      workEmail: z.string().nullable().optional(),
      primaryBranchId: z.string().uuid().nullable().optional(),
    })
    .optional(),
});

export type EmployeeHolidaySelection = z.infer<typeof employeeHolidaySelectionSchema>;

export const holidaySettingsSchema = z.object({
  organizationId: z.string().uuid().optional(),
  optionalHolidayAllowance: z.number(),
});

export type HolidaySettings = z.infer<typeof holidaySettingsSchema>;

/**
 * Per-employee holiday policy override.
 *
 * `allowanceOverride` — null means "use org global allowance".
 * `restrictedHolidayIds` — empty array means "full org/branch optional pool".
 */
export const employeeHolidayPolicySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  allowanceOverride: z.number().int().nullable(),
  restrictedHolidayIds: z.array(z.string().uuid()),
  createdAt: z.string(),
  updatedAt: z.string(),
  employee: z
    .object({
      id: z.string().uuid(),
      employeeNumber: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      workEmail: z.string().nullable().optional(),
    })
    .optional(),
});

export type EmployeeHolidayPolicy = z.infer<typeof employeeHolidayPolicySchema>;

export const employeeHolidaySummarySchema = z.object({
  year: z.number(),
  allowance: z.number(),
  usedCount: z.number(),
  remainingCount: z.number(),
  mandatory: z.array(holidaySchema),
  optionalPool: z.array(holidaySchema),
  selectedHolidayIds: z.array(z.string().uuid()),
  selections: z.array(employeeHolidaySelectionSchema),
});

export type EmployeeHolidaySummary = z.infer<typeof employeeHolidaySummarySchema>;

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

export const parseHolidayList = (payload: unknown) => parseList(holidaySchema, payload);

export function parseHoliday(payload: unknown): Holiday | null {
  return parse(holidaySchema, payload);
}

export const parseHolidaySettings = (payload: unknown) => parse(holidaySettingsSchema, payload);
export const parseEmployeeHolidaySummary = (payload: unknown) =>
  parse(employeeHolidaySummarySchema, payload);
export const parseEmployeeHolidaySelectionList = (payload: unknown) =>
  parseList(employeeHolidaySelectionSchema, payload);
export const parseEmployeeHolidayPolicy = (payload: unknown) =>
  parse(employeeHolidayPolicySchema, payload);
export const parseEmployeeHolidayPolicyList = (payload: unknown) =>
  parseList(employeeHolidayPolicySchema, payload);

/** The calendar year of a holiday, for grouping a list the server returned. */
export function holidayYear(holiday: Pick<Holiday, 'holidayDate'>): string {
  return holiday.holidayDate.slice(0, 4);
}
