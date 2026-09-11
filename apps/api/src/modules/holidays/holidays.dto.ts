import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class HolidayDto {
  @IsString() @MinLength(2) name!: string;
  @IsDateString() holidayDate!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
}

/**
 * Only the name and the optional flag can change. The date and branch form the uniqueness key and
 * decide what past leave requests were charged, so moving a holiday is retiring one and adding
 * another.
 */
export class UpdateHolidayDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
}

export class HolidayDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}

export class HolidayQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateHolidaySettingsDto {
  @IsInt()
  @Min(0)
  @Max(365)
  optionalHolidayAllowance!: number;
}

export class SelectHolidaysDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  holidayIds!: string[];
}

export class CancelHolidaySelectionDto {
  @IsUUID()
  holidayId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class EmployeeHolidayQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year?: number;
}

export class HolidaySelectionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

/**
 * Admin-facing DTO for creating or updating a per-employee optional holiday policy.
 *
 * `allowanceOverride` — null/undefined means "remove override and fall back to org default".
 * `restrictedHolidayIds` — empty array means "use the full org/branch pool".
 */
export class UpsertEmployeeHolidayPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  allowanceOverride?: number | null;

  @IsArray()
  @IsUUID('4', { each: true })
  restrictedHolidayIds!: string[];
}
