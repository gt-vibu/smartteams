import { OmitType } from '@nestjs/swagger';
import { LIMITS } from '@smarteam/contracts';
import { IsEnum, IsOptional } from 'class-validator';
import {
  IsCalendarDate,
  IsCode,
  IsNumberBetween,
  IsText,
  IsWholeNumber,
  withRules,
  yearsFromToday,
} from '../../common/validation/field-rules';
import { LeaveDecisionDto, LeaveRequestDto, LeaveTypeDto } from './leave.dto';

/**
 * The website's own versions of the leave inputs federation shares, with the limits the forms
 * apply. The shared inputs are unchanged, so a partner's request is accepted exactly as before.
 */

/** A leave year has at most 366 days; no allowance, carry-over or encashment can exceed it. */
const YEAR = 366;

export class LeaveDateAvailabilityDto {
  @IsCalendarDate('From date', { earliest: yearsFromToday(-2), latest: yearsFromToday(2) })
  from!: string;
  @IsCalendarDate('To date', { earliest: yearsFromToday(-2), latest: yearsFromToday(2) })
  to!: string;
}

export class NativeLeaveTypeDto extends LeaveTypeDto {}
withRules(NativeLeaveTypeDto, {
  code: [IsCode('Code')],
  name: [IsText('Name', LIMITS.title, 2)],
  annualAllowance: [IsOptional(), IsNumberBetween('Days a year', 0, YEAR)],
  monthlyAccrual: [IsOptional(), IsNumberBetween('Days a month', 0, 31)],
  carryoverLimit: [IsOptional(), IsNumberBetween('Carry-over limit', 0, YEAR)],
  maxEncashDays: [IsOptional(), IsNumberBetween('Days that can be encashed', 0, YEAR)],
  compOffExpiryDays: [IsOptional(), IsWholeNumber('Comp off validity in days', 1, 365)],
});

/** Editing a leave type: everything but its code, which is fixed once created. */
export class NativeLeaveTypeUpdateDto extends OmitType(NativeLeaveTypeDto, ['code'] as const) {}

export class NativeLeaveRequestDto extends LeaveRequestDto {
  @IsOptional() @IsEnum(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF']) session?:
    'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
}
withRules(NativeLeaveRequestDto, {
  // Leave is applied for within two years either side of today, never for 1900 or 2999.
  startDate: [
    IsCalendarDate('Start date', { earliest: yearsFromToday(-2), latest: yearsFromToday(2) }),
  ],
  endDate: [
    IsCalendarDate('End date', { earliest: yearsFromToday(-2), latest: yearsFromToday(2) }),
  ],
  reason: [IsOptional(), IsText('Reason', LIMITS.reason)],
});

export class NativeLeaveDecisionDto extends LeaveDecisionDto {}
withRules(NativeLeaveDecisionDto, {
  comment: [IsOptional(), IsText('Comment', LIMITS.reason, 2)],
});
