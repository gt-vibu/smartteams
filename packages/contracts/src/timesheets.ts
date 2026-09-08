import { z } from 'zod';

/**
 * Timesheet shapes, matching what `TimesheetsService` returns.
 *
 * Minutes are integers on the wire, not decimals, so no coercion is needed — but they are the
 * figures payroll prices overtime from, so the schema is strict rather than permissive.
 */

export const timesheetPeriodSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  periodType: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.string().optional(),
});

export const timesheetEntrySchema = z.object({
  id: z.string().uuid(),
  timesheetId: z.string().uuid().optional(),
  workDate: z.string(),
  minutes: z.number(),
  overtimeMinutes: z.number().optional(),
  description: z.string().nullable().optional(),
  source: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
  projectName: z.string().nullable().optional(),
  jobName: z.string().nullable().optional(),
  workItem: z.string().nullable().optional(),
  billable: z.boolean().optional(),
  attachmentUrl: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
});

export const timesheetSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  periodId: z.string().uuid(),
  period: timesheetPeriodSchema.optional(),
  status: z.string(),
  totalMinutes: z.number(),
  regularMinutes: z.number(),
  overtimeMinutes: z.number(),
  version: z.number().optional(),
  entries: z.array(timesheetEntrySchema).optional(),
});

export const jobTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type TimesheetPeriod = z.infer<typeof timesheetPeriodSchema>;
export type TimesheetEntry = z.infer<typeof timesheetEntrySchema>;
export type Timesheet = z.infer<typeof timesheetSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;

function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parseTimesheetList = (payload: unknown) => parseList(timesheetSchema, payload);
export const parseJobTypeList = (payload: unknown) => parseList(jobTypeSchema, payload);

export function parseTimesheet(payload: unknown): Timesheet | null {
  const result = timesheetSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** Default enterprise job types */
export const DEFAULT_JOB_TYPES: string[] = [
  'Development',
  'Testing',
  'Code Review',
  'Bug Fixing',
  'Documentation',
  'Meeting',
  'Research',
  'Deployment',
  'Support',
  'UI/UX Design',
];

/** A timesheet the employee can still edit. Anything submitted is locked pending a decision. */
export function isEditable(timesheet: Pick<Timesheet, 'status'>): boolean {
  return timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';
}

/** A timesheet awaiting a decision. */
export function isAwaitingDecision(timesheet: Pick<Timesheet, 'status'>): boolean {
  return timesheet.status === 'SUBMITTED';
}

/** Entries grouped by work date, newest first — the shape the log table renders. */
export function entriesByDate(timesheet: Pick<Timesheet, 'entries'>) {
  const groups = new Map<string, TimesheetEntry[]>();
  for (const entry of timesheet.entries ?? []) {
    const key = entry.workDate.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([workDate, entries]) => ({
      workDate,
      entries,
      totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    }));
}

/** `7h 45m`, or `--` when there is nothing to show. */
export function formatWorkMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
