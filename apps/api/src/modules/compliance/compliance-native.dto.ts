import { IsOptional } from 'class-validator';
import { IsAmount, IsNumberBetween, withRules } from '../../common/validation/field-rules';
import { StatutoryProfileDto, StatutoryRecordWriteDto } from './compliance.dto';

/**
 * The website's own statutory inputs, with the ranges the shared inputs (which federation also
 * sends) do not carry: a rate is a percentage, an amount is money. The shared inputs are unchanged.
 */
export class NativeStatutoryProfileDto extends StatutoryProfileDto {}
withRules(NativeStatutoryProfileDto, {
  employeeRate: [IsOptional(), IsNumberBetween('Employee rate', 0, 100)],
  employerRate: [IsOptional(), IsNumberBetween('Employer rate', 0, 100)],
});

export class NativeStatutoryRecordWriteDto extends StatutoryRecordWriteDto {}
withRules(NativeStatutoryRecordWriteDto, {
  employeeAmount: [IsOptional(), IsAmount('Employee amount')],
  employerAmount: [IsOptional(), IsAmount('Employer amount')],
});
