import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BreakRuleDto {
  @IsString() name!: string;
  @IsNumber() @Min(1) durationMinutes!: number;
  @IsBoolean() isPaid!: boolean;
  @IsNumber() @Min(1) sequence!: number;
}
export class ShiftDto {
  /** Federation supplies its own; the app generates one from the name. */
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek!: number[];
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsBoolean() crossesMidnight!: boolean;
  @IsNumber() @Min(0) breakMinutes!: number;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BreakRuleDto)
  breakRules?: BreakRuleDto[];
}

/** A shift created in the app: a name is enough, and the code is generated from it. */
export class NativeShiftDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek!: number[];
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsBoolean() crossesMidnight!: boolean;
  @IsNumber() @Min(0) breakMinutes!: number;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BreakRuleDto)
  breakRules?: BreakRuleDto[];
}

export class UpdateShiftDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
  @IsOptional() @IsNumber() @Min(0) breakMinutes?: number;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BreakRuleDto)
  breakRules?: BreakRuleDto[];
}
export class ShiftDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}
export class ShiftAssignmentDto {
  @IsUUID() shiftId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
}

/** `YYYY-MM-DD`; a date, not an instant. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CurrentShiftQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @Matches(DATE_ONLY) on?: string;
}

export class ShiftAssignmentListQueryDto {
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsIn(['true', 'false']) includeEnded?: 'true' | 'false';
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/** The employee's last day on the shift, and why it ends. */
export class EndShiftAssignmentDto {
  @Matches(DATE_ONLY) endsOn!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ShiftRotationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsUUID('4', { each: true }) shiftIds!: string[];
  @IsInt() @Min(1) @Max(12) weeksPerShift!: number;
  @IsDateString() startsOn!: string;
  @IsInt() @Min(1) @Max(26) totalWeeks!: number;
  @IsOptional() @IsBoolean() stagger?: boolean;
}
