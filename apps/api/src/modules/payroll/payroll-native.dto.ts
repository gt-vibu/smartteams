import { OmitType } from '@nestjs/swagger';
import { LIMITS } from '@smarteam/contracts';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsAmount,
  IsCalendarDate,
  IsCode,
  IsNumberBetween,
  IsText,
  IsWholeNumber,
  withRules,
  yearsFromToday,
} from '../../common/validation/field-rules';
import {
  PayComponentDto,
  PayrollActionDto,
  PayrollAdjustmentDto,
  PayrollPaymentDto,
  PayrollPolicyDto,
  PayrollRunDto,
  SalaryAdvanceDecisionDto,
  StatutoryRuleDto,
} from './payroll.dto';

/**
 * The website's own versions of the payroll inputs federation shares, with the limits the forms
 * apply. The shared inputs are unchanged, so a partner's request is accepted exactly as before.
 */

const PERIOD = { earliest: yearsFromToday(-5), latest: yearsFromToday(2) };

export class NativePayComponentDto extends PayComponentDto {}
withRules(NativePayComponentDto, {
  code: [IsCode('Component code')],
  name: [IsText('Component name', LIMITS.title, 2)],
  displayOrder: [IsOptional(), IsWholeNumber('Display order', 0, 1000)],
});

export class NativePayrollRunDto extends PayrollRunDto {}
withRules(NativePayrollRunDto, {
  periodStart: [IsCalendarDate('Period start', PERIOD)],
  periodEnd: [IsCalendarDate('Period end', PERIOD)],
});

/** Per-employee choice to defer all advance recovery for this payroll period. */
export class NativePayrollCalculationDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10000)
  @IsUUID('4', { each: true })
  deferAdvanceEmployeeIds?: string[];
}

/**
 * An adjustment added to a pay run: the run comes from the address. This route used to declare
 * `Omit<PayrollAdjustmentDto, …>`, a type that does not exist when the app runs, so its body
 * reached the service unchecked.
 */
export class NativeRunAdjustmentDto extends OmitType(PayrollAdjustmentDto, [
  'payrollRunId',
] as const) {
  /** Sent by older callers; the run in the address is the one used. */
  @IsOptional() @IsUUID() payrollRunId?: string;
}
withRules(NativeRunAdjustmentDto, {
  // A deduction is its own type, so the amount itself is never negative.
  amount: [IsAmount('Amount', LIMITS.amount, 0.01)],
  description: [IsText('Description', LIMITS.reason, 3)],
  externalId: [IsOptional(), IsText('Reference', 120)],
});

// Native payroll decisions do not require reviewer comments. Omit the shared comment field
// before adding an optional version so class-validator does not retain its inherited MinLength.
export class NativePayrollActionDto extends OmitType(PayrollActionDto, ['comment'] as const) {
  @IsOptional() @IsString() @MaxLength(LIMITS.reason) comment?: string;
}

export class NativePayrollPaymentDto extends PayrollPaymentDto {}
withRules(NativePayrollPaymentDto, {
  paymentReference: [IsOptional(), IsText('Payment reference', 120)],
});

export class NativePayrollPolicyDto extends PayrollPolicyDto {}
withRules(NativePayrollPolicyDto, {
  name: [IsOptional(), IsText('Policy name', LIMITS.title, 2)],
  effectiveFrom: [IsCalendarDate('Effective date', PERIOD)],
  baseMinimum: [IsAmount('Minimum basic pay')],
  statutoryJurisdiction: [IsOptional(), IsText('State', 60)],
});

export class NativeSalaryAdvanceDecisionDto extends SalaryAdvanceDecisionDto {}
withRules(NativeSalaryAdvanceDecisionDto, {
  approvedAmount: [IsOptional(), IsAmount('Approved amount', LIMITS.amount, 0.01)],
  comment: [IsOptional(), IsText('Comment', LIMITS.reason, 2)],
});

export class NativeStatutoryRuleDto extends StatutoryRuleDto {}
withRules(NativeStatutoryRuleDto, {
  schemeCode: [IsCode('Scheme code', 40)],
  jurisdiction: [IsText('State', 60)],
  effectiveFrom: [IsCalendarDate('Effective date', PERIOD)],
  employeeRate: [IsOptional(), IsNumberBetween('Employee rate', 0, 100)],
  employerRate: [IsOptional(), IsNumberBetween('Employer rate', 0, 100)],
  wageCeiling: [IsOptional(), IsAmount('Wage ceiling')],
  employeeThreshold: [IsOptional(), IsAmount('Wage threshold')],
  flatAmount: [IsOptional(), IsAmount('Flat amount')],
});

export class NativePayrollAssignmentRuleDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() name!: string;
  @IsUUID() payrollPolicyId!: string;
  @IsObject() criteria!: Record<string, unknown>;
  @IsInt() @Min(1) @Max(10000) priority!: number;
  @IsCalendarDate('Effective date', PERIOD) effectiveFrom!: string;
  @IsOptional() @IsCalendarDate('End date', PERIOD) effectiveTo?: string;
  @IsBoolean() enabled!: boolean;
}
withRules(NativePayrollAssignmentRuleDto, {
  name: [IsText('Rule name', LIMITS.title, 2)],
});
