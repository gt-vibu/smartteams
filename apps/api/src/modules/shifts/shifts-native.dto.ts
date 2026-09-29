import { IsOptional } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import {
  IsCalendarDate,
  IsClockTime,
  IsCode,
  IsText,
  IsWholeNumber,
  withRules,
  yearsFromToday,
} from '../../common/validation/field-rules';
import { ShiftAssignmentDto, ShiftDeactivationDto, UpdateShiftDto } from './shifts.dto';

/**
 * The website's own versions of the shift inputs federation shares, with the limits the forms
 * apply. The shared inputs are unchanged, so a partner's request is accepted exactly as before.
 */

export class NativeUpdateShiftDto extends UpdateShiftDto {}
withRules(NativeUpdateShiftDto, {
  code: [IsOptional(), IsCode('Shift code')],
  name: [IsOptional(), IsText('Shift name', LIMITS.title, 2)],
  startsAt: [IsOptional(), IsClockTime('Start time')],
  endsAt: [IsOptional(), IsClockTime('End time')],
  breakMinutes: [IsOptional(), IsWholeNumber('Break', 0, 720)],
});

export class NativeShiftDeactivationDto extends ShiftDeactivationDto {}
withRules(NativeShiftDeactivationDto, {
  reason: [IsText('Reason', LIMITS.reason, 2)],
});

export class NativeShiftAssignmentDto extends ShiftAssignmentDto {}
withRules(NativeShiftAssignmentDto, {
  startsOn: [
    IsCalendarDate('Start date', { earliest: yearsFromToday(-5), latest: yearsFromToday(2) }),
  ],
  endsOn: [
    IsOptional(),
    IsCalendarDate('End date', { earliest: yearsFromToday(-5), latest: yearsFromToday(10) }),
  ],
});
