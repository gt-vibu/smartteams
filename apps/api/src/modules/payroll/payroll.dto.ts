import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { PayFrequency } from '../../generated/prisma/enums';
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
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsNumber() percentage?: number;
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
  @IsNumber() @Min(1) payrollDayOfMonth!: number;
}
export class PayrollPayslipQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
}
import type { PayrollAdjustmentType, PayrollRunStatus } from '../../generated/prisma/enums';
