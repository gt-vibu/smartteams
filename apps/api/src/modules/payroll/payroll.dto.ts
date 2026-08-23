import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
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
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsDateString() effectiveFrom!: string;
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
  @IsEnum(['CALCULATED', 'APPROVED', 'RELEASED', 'LOCKED']) target!: PayrollRunStatus;
  @IsString() @MinLength(3) comment!: string;
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
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() salarySlipDefault!: boolean;
  @IsBoolean() payrollEnabledDefault!: boolean;
  @IsNumber() @Min(1) @Max(31) payrollDayBasis!: number;
  @IsNumber() @Min(0) @Max(100) basePercentage!: number;
  @IsNumber() @Min(0) baseMinimum!: number;
  @IsNumber() @Min(0) @Max(100) hraPercentage!: number;
  @IsBoolean() pfDefault!: boolean;
  @IsBoolean() esiDefault!: boolean;
  @IsBoolean() ptDefault!: boolean;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
  @IsEnum(PayrollRoundingMode) roundingMode!: PayrollRoundingMode;
}

export class EmployeePayrollPolicyDto {
  @IsUUID() employeeId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsBoolean() payrollEnabled!: boolean;
  @IsEnum(SalarySlipMode) salarySlipMode!: SalarySlipMode;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
  @IsOptional() @IsString() statutoryJurisdiction?: string;
}

export class SalaryProfileDto {
  @IsUUID() employeeId!: string;
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
  @IsOptional() @IsString() statutoryJurisdiction?: string;
}

export class PayrollPreviewDto {
  @IsUUID() employeeId!: string;
  @IsNumber() @Min(0) @IsOptional() payableDays?: number;
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
  @IsNumber() @Min(0.01) requestedAmount!: number;
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsString() externalId?: string;
}

export class SalaryAdvanceDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED', 'CANCELLED']) status!: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  @IsOptional() @IsNumber() @Min(0.01) approvedAmount?: number;
  @IsString() @MinLength(3) comment!: string;
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
import type { PayrollAdjustmentType, PayrollRunStatus } from '../../generated/prisma/enums';
