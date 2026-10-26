import { OmitType } from '@nestjs/swagger';
import { LIMITS } from '@smarteam/contracts';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsCalendarDate, IsNumberBetween, IsText } from '../../common/validation/field-rules';

export class LeaveTypeDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsBoolean() paid!: boolean;
  @IsEnum(['NONE', 'FIXED_ANNUAL', 'MONTHLY', 'PER_PAY_PERIOD', 'MANUAL']) accrualType!:
    'NONE' | 'FIXED_ANNUAL' | 'MONTHLY' | 'PER_PAY_PERIOD' | 'MANUAL';
  @IsOptional() @IsNumber() @Min(0) annualAllowance?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyAccrual?: number;
  @IsOptional() @IsNumber() @Min(0) carryoverLimit?: number;
  @IsOptional() @IsBoolean() prorateForJoiners?: boolean;
  @IsOptional() @IsBoolean() sandwichOffDays?: boolean;
  @IsOptional() @IsBoolean() encashable?: boolean;
  @IsOptional() @IsNumber() @Min(0) maxEncashDays?: number;
  @IsOptional() @IsBoolean() isCompOff?: boolean;
  @IsOptional() @IsInt() @Min(1) compOffExpiryDays?: number;
  @IsBoolean() requiresAttachment!: boolean;
}

/** Everything about a type but its code, which requests and balances refer to. */
export class LeaveTypeUpdateDto extends OmitType(LeaveTypeDto, ['code'] as const) {}

/** A span of days for the team calendar. */
export class LeaveCalendarQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
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
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) decidedByExternalEmployeeId?: string;
}

export class LeaveCancelDto {
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}

export class LeaveAdjustmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsNumberBetween('Days', -366, 366) amount!: number;
  @IsText('Reason', LIMITS.reason, 5) reason!: string;
  @IsCalendarDate('Period start') periodStart!: string;
  @IsCalendarDate('Period end') periodEnd!: string;
}

/** Filters for the leave request list. Mirrors what the federation surface already accepts. */
export class LeaveRequestQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?:
    'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/** Selects whose balances to read; omitted means every employee the caller may see. */
export class LeaveBalanceQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsUUID() employeeId?: string;
}

export class LeavePolicyAssignmentDto {
  @IsUUID() branchId!: string;
}
