import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class LeaveTypeDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsBoolean() paid!: boolean;
  @IsEnum(['NONE', 'FIXED_ANNUAL', 'MONTHLY', 'PER_PAY_PERIOD', 'MANUAL']) accrualType!:
    'NONE' | 'FIXED_ANNUAL' | 'MONTHLY' | 'PER_PAY_PERIOD' | 'MANUAL';
  @IsOptional() @IsNumber() @Min(0) annualAllowance?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyAccrual?: number;
  @IsOptional() @IsNumber() @Min(0) carryoverLimit?: number;
  @IsBoolean() requiresAttachment!: boolean;
}

export class LeaveRequestDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class LeaveDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(2) comment!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) decidedByExternalEmployeeId?: string;
}

export class LeaveCancelDto {
  @IsString() @MinLength(3) reason!: string;
}

export class LeaveAdjustmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsNumber() amount!: number;
  @IsString() @MinLength(5) reason!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}
