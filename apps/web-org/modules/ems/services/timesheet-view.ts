import { entriesByDate, formatWorkMinutes, type Timesheet } from '@smarteam/contracts';

/**
 * Presentation shapes derived from timesheets the API returned.
 *
 * Three fields the old fixture carried are deliberately absent, because `ManualEntryDto` has no
 * column for any of them: **project**, **job/task** and **billable**. A time entry the API
 * accepts is a date, a duration, optional overtime and a free-text description. Showing a
 * project column would mean inventing an attribution that payroll and billing never receive.
 */

export type TimesheetSummary = {
  totalLabel: string;
  submittedLabel: string;
  notSubmittedLabel: string;
  approvedLabel: string;
  totalMinutes: number;
};

export type TimesheetDayGroup = {
  workDate: string;
  totalLabel: string;
  entries: {
    id: string;
    minutes: number;
    label: string;
    description: string | null;
    projectId?: string | null;
    projectName?: string | null;
    jobName?: string | null;
    workItem?: string | null;
    billable?: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }[];
};

/**
 * Totals across the periods the caller can see.
 *
 * `SUBMITTED` and `APPROVED` are counted separately: a submitted sheet is not yet money, and
 * collapsing the two would overstate what has been agreed.
 */
export function summarize(timesheets: readonly Timesheet[]): TimesheetSummary {
  let total = 0;
  let submitted = 0;
  let approved = 0;
  for (const sheet of timesheets) {
    total += sheet.totalMinutes;
    if (sheet.status === 'SUBMITTED') submitted += sheet.totalMinutes;
    if (sheet.status === 'APPROVED') approved += sheet.totalMinutes;
  }
  return {
    totalLabel: formatWorkMinutes(total),
    submittedLabel: formatWorkMinutes(submitted),
    notSubmittedLabel: formatWorkMinutes(total - submitted - approved),
    approvedLabel: formatWorkMinutes(approved),
    totalMinutes: total,
  };
}

/** One timesheet's entries, grouped by day, newest first. */
export function toDayGroups(timesheet: Timesheet | null): TimesheetDayGroup[] {
  if (!timesheet) return [];
  return entriesByDate(timesheet).map((group) => ({
    workDate: group.workDate,
    totalLabel: formatWorkMinutes(group.totalMinutes),
    entries: group.entries.map((entry) => ({
      id: entry.id,
      minutes: entry.minutes,
      label: formatWorkMinutes(entry.minutes),
      description: entry.description ?? null,
      projectId: entry.projectId ?? null,
      projectName: entry.projectName ?? null,
      jobName: entry.jobName ?? null,
      workItem: entry.workItem ?? null,
      billable: entry.billable ?? true,
      startTime: entry.startTime ?? null,
      endTime: entry.endTime ?? null,
    })),
  }));
}

/**
 * The most recently approved timesheet, for the "your timesheet was approved" banner.
 *
 * Derived from status rather than from a notification record: the API has no notification
 * entity, so this is the only honest source.
 */
export function latestApproved(timesheets: readonly Timesheet[]): Timesheet | null {
  return timesheets.find((sheet) => sheet.status === 'APPROVED') ?? null;
}

/**
 * Parses `1h 30m`, `1:30` or `90` into minutes.
 *
 * Returns null rather than guessing when the text is not a duration, so a typo becomes a
 * validation message instead of a silently wrong number of hours.
 */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const composite = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(trimmed);
  if (composite && (composite[1] || composite[2])) {
    return Math.round(Number(composite[1] ?? 0) * 60 + Number(composite[2] ?? 0));
  }

  const bare = /^\d+(?:\.\d+)?$/.exec(trimmed);
  if (bare) return Math.round(Number(trimmed));

  return null;
}
