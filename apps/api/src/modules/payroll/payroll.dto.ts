import { LIMITS } from '@smarteam/contracts';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  IsAmount,
  IsCalendarDate,
  IsNumberBetween,
  IsText,
  yearsFromToday,
} from '../../common/validation/field-rules';
import type { PayrollAdjustmentType, PayrollRunStatus } from '../../generated/prisma/enums';
import {
  PayFrequency,
  PayrollPaymentMethod,
  PayrollRoundingMode,
  SalarySlipMode,
} from '../../generated/prisma/enums';
export class PayComponentDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsEnum(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']) componentType!:
    'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  @IsEnum(['FIXED', 'PERCENTAGE_OF_BASE', 'FORMULA']) calculationType!:
    'FIXED' | 'PERCENTAGE_OF_BASE' | 'FORMULA';
  @IsOptional() formulaDefinition?: unknown;
  @IsBoolean() isTaxable!: boolean;
  @IsOptional() @IsNumber() @Min(0) displayOrder?: number;
}
export class PayComponentAssignmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() payComponentId!: string;
  @IsOptional() @IsAmount('Amount') amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsCalendarDate('Effective date', { earliest: yearsFromToday(-5), latest: yearsFromToday(2) })
  effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
export class PayrollRunDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsEnum(PayFrequency) payFrequency?: PayFrequency;
}
export class PayrollAdjustmentDto {
  @IsUUID() payrollRunId!: string;
  @IsUUID() employeeId!: string;
  @IsEnum(['BONUS', 'DEDUCTION', 'REIMBURSEMENT', 'OVERTIME', 'TAX', 'OTHER'])
  type!: PayrollAdjustmentType;
  @IsNumber() amount!: number;
  @IsString() @MinLength(3) description!: string;
  @IsBoolean() taxable!: boolean;
  @IsOptional() @IsString() externalId?: string;
}
export class PayrollActionDto {
  // CORRECTED is deliberately absent: correcting creates a replacement run, so it has its own
  // route rather than pretending to be a status move.
  @IsEnum(['CALCULATED', 'APPROVED', 'RELEASED', 'LOCKED', 'VOIDED']) target!: PayrollRunStatus;
  @IsString() @MinLength(3) comment!: string;
}
export class PayrollCorrectionDto {
  @IsText('Reason', LIMITS.reason, 10) reason!: string;
}
export class PayrollCalendarDto {
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsDateString() attendanceFreezeDate?: string;
  @IsOptional() @IsDateString() calculationDate?: string;
  @IsOptional() @IsDateString() releaseDate?: string;
  @IsOptional() @IsDateString() salaryCreditDate?: string;
}
export class PayrollPayslipQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
}

/** One page of advances or payments on the native routes. */
export class PayrollListQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(500) limit?: number;
}

export class PayrollLedgerQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(500) limit?: number;
}

export class FederatedPayComponentAssignmentDto {
  @IsString() externalEmployeeId!: string;
  @IsUUID() payComponentId!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class PayrollPolicyDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() name?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() salarySlipDefault!: boolean;
  @IsBoolean() payrollEnabledDefault!: boolean;
  @IsNumber() @Min(1) @Max(31) payrollDayBasis!: number;
  @IsNumber() @Min(0) @Max(100) basePercentage!: number;
  @IsNumber() @Min(0) baseMinimum!: number;
  @IsNumber() @Min(0) @Max(100) hraPercentage!: number;
  @IsOptional() @IsNumber() @Min(1) defaultGrossSalary?: number;
  @IsBoolean() pfDefault!: boolean;
  @IsBoolean() esiDefault!: boolean;
  @IsBoolean() ptDefault!: boolean;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
  @IsEnum(PayrollRoundingMode) roundingMode!: PayrollRoundingMode;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollPolicyComponentDto)
  components?: PayrollPolicyComponentDto[];
}

export class PayrollPolicyComponentDto {
  @IsUUID() payComponentId!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsOptional() @IsObject() formulaParameters?: Record<string, unknown>;
  @IsOptional() @IsNumber() @Min(0) displayOrder?: number;
}

export class EmployeePayrollPolicyDto {
  @IsUUID() employeeId!: string;
  @IsCalendarDate('Effective date', { earliest: yearsFromToday(-5), latest: yearsFromToday(2) })
  effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() payrollEnabled!: boolean;
  @IsEnum(SalarySlipMode) salarySlipMode!: SalarySlipMode;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
  @IsOptional() @IsUUID() payrollPolicyId?: string;
  @IsOptional() @IsText('State', 60) statutoryJurisdiction?: string;
}

export class SalaryProfileDto {
  @IsUUID() employeeId!: string;
  @IsAmount('Gross salary') grossSalary!: number;
  @IsEnum(['SALARY', 'HOURLY', 'DAILY', 'PER_SHIFT']) payType!:
    'SALARY' | 'HOURLY' | 'DAILY' | 'PER_SHIFT';
  @IsEnum(PayFrequency) payFrequency!: PayFrequency;
  @IsNumberBetween('Overtime multiplier', 1, 5) overtimeMultiplier!: number;
  @IsCalendarDate('Effective date', { earliest: yearsFromToday(-5), latest: yearsFromToday(2) })
  effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() payrollEnabled!: boolean;
  @IsEnum(SalarySlipMode) salarySlipMode!: SalarySlipMode;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
  @IsOptional() @IsUUID() payrollPolicyId?: string;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
}

export class SalaryProfilePreviewDto {
  @IsUUID() employeeId!: string;
  @IsAmount('Gross salary') grossSalary!: number;
  @IsOptional() @IsBoolean() pfEnabled?: boolean;
  @IsOptional() @IsBoolean() esiEnabled?: boolean;
  @IsOptional() @IsBoolean() ptEnabled?: boolean;
}

export class PayrollPreviewDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsNumberBetween('Payable days', 0, 31) payableDays?: number;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export class StatutoryRuleDto {
  @IsString() schemeCode!: string;
  @IsString() jurisdiction!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsNumber() @Min(0) employeeRate?: number;
  @IsOptional() @IsNumber() @Min(0) employerRate?: number;
  @IsOptional() @IsNumber() @Min(0) wageCeiling?: number;
  @IsOptional() @IsNumber() @Min(0) employeeThreshold?: number;
  @IsOptional() @IsNumber() @Min(0) flatAmount?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class SalaryAdvanceDto {
  @IsUUID() employeeId!: string;
  @IsAmount('Amount', LIMITS.amount, 1) requestedAmount!: number;
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
  @IsOptional() @IsText('Reference', 120) externalId?: string;
}

export class SalaryAdvanceDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED', 'CANCELLED']) status!: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  @IsOptional() @IsNumber() @Min(0.01) approvedAmount?: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class PayrollPaymentDto {
  @IsEnum(PayrollPaymentMethod) paymentMethod!: PayrollPaymentMethod;
  @IsOptional() @IsString() paymentReference?: string;
}

export class FederatedEmployeePayrollPolicyDto {
  @IsString() externalEmployeeId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() payrollEnabled!: boolean;
  @IsEnum(SalarySlipMode) salarySlipMode!: SalarySlipMode;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
  @IsOptional() @IsUUID() payrollPolicyId?: string;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
}

export class FederatedSalaryProfileDto {
  @IsString() externalEmployeeId!: string;
  @IsNumber() @Min(0) grossSalary!: number;
  @IsEnum(['SALARY', 'HOURLY', 'DAILY', 'PER_SHIFT']) payType!:
    'SALARY' | 'HOURLY' | 'DAILY' | 'PER_SHIFT';
  @IsEnum(PayFrequency) payFrequency!: PayFrequency;
  @IsNumber() @Min(0) overtimeMultiplier!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() payrollEnabled!: boolean;
  @IsEnum(SalarySlipMode) salarySlipMode!: SalarySlipMode;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
  @IsOptional() @IsUUID() payrollPolicyId?: string;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
}

export class FederatedPayrollPreviewDto {
  @IsString() externalEmployeeId!: string;
  @IsNumber() @Min(0) @IsOptional() payableDays?: number;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export class FederatedSalaryAdvanceDto {
  @IsString() externalEmployeeId!: string;
  @IsNumber() @Min(0.01) requestedAmount!: number;
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsString() externalId?: string;
}
