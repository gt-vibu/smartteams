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
  const result = holidaySchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The calendar year of a holiday, for grouping a list the server returned. */
export function holidayYear(holiday: Pick<Holiday, 'holidayDate'>): string {
  return holiday.holidayDate.slice(0, 4);
}
