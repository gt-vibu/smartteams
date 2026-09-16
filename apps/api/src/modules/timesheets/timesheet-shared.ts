import { ConflictError } from '../../common/errors/domain-error';

/**
 * Constants and pure rules the services in this module share.
 */
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

export function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}

export interface TimesheetEntryMetadataInput {
  description?: string;
  projectId?: string;
  projectName?: string;
  jobName?: string;
  workItem?: string;
  billable?: boolean;
  attachmentUrl?: string;
  startTime?: string;
  endTime?: string;
}

export function encodeEntryDescription(meta: TimesheetEntryMetadataInput): string | undefined {
  if (
    !meta.projectId &&
    !meta.jobName &&
    !meta.workItem &&
    meta.billable === undefined &&
    !meta.attachmentUrl &&
    !meta.startTime &&
    !meta.endTime
  ) {
    return meta.description;
  }
  return JSON.stringify({
    __is_meta: true,
    notes: meta.description || '',
    projectId: meta.projectId,
    projectName: meta.projectName,
    jobName: meta.jobName,
    workItem: meta.workItem,
    billable: meta.billable ?? true,
    attachmentUrl: meta.attachmentUrl,
    startTime: meta.startTime,
    endTime: meta.endTime,
  });
}

export function decodeEntry<T extends { description?: string | null }>(
  entry: T,
): T & {
  projectId?: string | null;
  projectName?: string | null;
  jobName?: string | null;
  workItem?: string | null;
  billable?: boolean;
  attachmentUrl?: string | null;
  startTime?: string | null;
  endTime?: string | null;
} {
  if (!entry.description) return entry;
  try {
    if (entry.description.startsWith('{') && entry.description.includes('"__is_meta":true')) {
      const parsed = JSON.parse(entry.description) as {
        notes?: string;
        projectId?: string;
        projectName?: string;
        jobName?: string;
        workItem?: string;
        billable?: boolean;
        attachmentUrl?: string;
        startTime?: string;
        endTime?: string;
      };
      return {
        ...entry,
        description: parsed.notes || '',
        projectId: parsed.projectId ?? null,
        projectName: parsed.projectName ?? null,
        jobName: parsed.jobName ?? null,
        workItem: parsed.workItem ?? null,
        billable: parsed.billable ?? true,
        attachmentUrl: parsed.attachmentUrl ?? null,
        startTime: parsed.startTime ?? null,
        endTime: parsed.endTime ?? null,
      };
    }
  } catch {
    // fallback to original
  }
  return entry;
}

export interface DerivedPeriodBounds {
  periodType: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
  periodStart: Date;
  periodEnd: Date;
}

export function derivePeriodBounds(
  workDate: Date,
  frequency: string = 'MONTHLY',
): DerivedPeriodBounds {
  const d = new Date(workDate.getTime());
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  switch (frequency) {
    case 'WEEKLY': {
      const dayOfWeek = d.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const periodStart = new Date(Date.UTC(year, month, day + diffToMonday));
      const periodEnd = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth(),
          periodStart.getUTCDate() + 6,
        ),
      );
      return { periodType: 'WEEKLY', periodStart, periodEnd };
    }
    case 'BIWEEKLY': {
      const dayOfWeek = d.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(Date.UTC(year, month, day + diffToMonday));
      const startOfYear = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
      const dayOfYear = Math.floor(
        (monday.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
      );
      const weekIndex = Math.floor(dayOfYear / 7);
      const isSecondWeek = weekIndex % 2 === 1;
      const periodStart = new Date(
        Date.UTC(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate() - (isSecondWeek ? 7 : 0),
        ),
      );
      const periodEnd = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth(),
          periodStart.getUTCDate() + 13,
        ),
      );
      return { periodType: 'BIWEEKLY', periodStart, periodEnd };
    }
    case 'SEMIMONTHLY': {
      if (day <= 15) {
        return {
          periodType: 'CUSTOM',
          periodStart: new Date(Date.UTC(year, month, 1)),
          periodEnd: new Date(Date.UTC(year, month, 15)),
        };
      } else {
        return {
          periodType: 'CUSTOM',
          periodStart: new Date(Date.UTC(year, month, 16)),
          periodEnd: new Date(Date.UTC(year, month + 1, 0)),
        };
      }
    }
    case 'MONTHLY':
    default: {
      return {
        periodType: 'MONTHLY',
        periodStart: new Date(Date.UTC(year, month, 1)),
        periodEnd: new Date(Date.UTC(year, month + 1, 0)),
      };
    }
  }
}
