import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
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
  @IsString() @Min(2) reason!: string;
}
export class ShiftAssignmentDto {
  @IsUUID() shiftId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
}
