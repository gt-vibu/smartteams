import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class PunchDto {
  @IsUUID() employeeId!: string;
  @IsDateString() occurredAt!: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) accuracyMeters?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() webauthnCredentialId?: string;
  @IsOptional() @IsString() externalId?: string;
}

export class AttendanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class AttendanceCorrectionDto {
  @IsString() @MinLength(10) reason!: string;
  @IsOptional() afterSnapshot?: Record<string, unknown>;
}

export class AttendanceDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(2) comment!: string;
}

export class WorkLocationDto {
  @IsString() @MinLength(2) name!: string;
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsNumber() @Min(1) radiusMeters!: number;
}

export class AttendancePreferencesDto {
  @IsOptional() @IsEnum(['DISABLED', 'FLAG_ONLY', 'REQUIRED']) geofenceMode?:
    'DISABLED' | 'FLAG_ONLY' | 'REQUIRED';
  @IsOptional() @IsEnum(['DISABLED', 'OPTIONAL', 'REQUIRED']) biometricVerificationMode?:
    'DISABLED' | 'OPTIONAL' | 'REQUIRED';
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkLocationDto)
  workLocations?: WorkLocationDto[];
}
