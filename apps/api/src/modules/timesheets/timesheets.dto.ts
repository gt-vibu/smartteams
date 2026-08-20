import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @IsString() comment!: string;
}
export class TimesheetQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() periodId?: string;
}
