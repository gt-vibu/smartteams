import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TimesheetPeriodDto {
  @IsEnum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']) periodType!:
    'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}
export class ManualEntryDto {
  @IsDateString() workDate!: string;
  @IsNumber() @Min(1) minutes!: number;
  @IsOptional() @IsNumber() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() jobName?: string;
  @IsOptional() @IsString() workItem?: string;
  @IsOptional() billable?: boolean;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsUUID() timesheetId?: string;
}

export class CreateJobTypeDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
}

export class QuickCreateProjectDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class TimesheetDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) decidedByExternalEmployeeId?: string;
}

export class TimesheetQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() periodId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']) status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
