import {
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
}
export class TimesheetDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(2) @MaxLength(500) comment!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) decidedByExternalEmployeeId?: string;
}
export class TimesheetQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() periodId?: string;
}
