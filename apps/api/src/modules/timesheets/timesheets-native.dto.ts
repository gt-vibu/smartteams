import { IsOptional } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import {
  IsCalendarDate,
  IsClockTime,
  IsText,
  IsWholeNumber,
  daysFromToday,
  withRules,
  yearsFromToday,
} from '../../common/validation/field-rules';
import { ManualEntryDto, TimesheetPeriodDto } from './timesheets.dto';

/**
 * The website's own versions of the timesheet inputs federation shares, with the limits the forms
 * apply. The shared inputs are unchanged, so a partner's request is accepted exactly as before.
 */

/** A day has 1,440 minutes; no entry can hold more. */
const DAY = 1440;

export class NativeManualEntryDto extends ManualEntryDto {}
withRules(NativeManualEntryDto, {
  // Time already worked: up to tomorrow, so "today" is accepted in every timezone.
  workDate: [IsCalendarDate('Date', { earliest: yearsFromToday(-1), latest: daysFromToday(1) })],
  minutes: [IsWholeNumber('Time worked in minutes', 1, DAY)],
  overtimeMinutes: [IsOptional(), IsWholeNumber('Overtime in minutes', 0, DAY)],
  description: [IsOptional(), IsText('Description', LIMITS.note, 0)],
  projectName: [IsOptional(), IsText('Project', LIMITS.title)],
  jobName: [IsOptional(), IsText('Job', LIMITS.title)],
  workItem: [IsOptional(), IsText('Work item', LIMITS.title)],
  attachmentUrl: [IsOptional(), IsText('Attachment', 2000)],
  startTime: [IsOptional(), IsClockTime('Start time')],
  endTime: [IsOptional(), IsClockTime('End time')],
});

export class NativeTimesheetPeriodDto extends TimesheetPeriodDto {}
withRules(NativeTimesheetPeriodDto, {
  periodStart: [
    IsCalendarDate('Start date', { earliest: yearsFromToday(-2), latest: yearsFromToday(1) }),
  ],
  periodEnd: [
    IsCalendarDate('End date', { earliest: yearsFromToday(-2), latest: yearsFromToday(2) }),
  ],
});
