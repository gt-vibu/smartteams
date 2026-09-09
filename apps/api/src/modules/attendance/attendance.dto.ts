import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsInt,
  MaxLength,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttendanceDayStatus } from '../../generated/prisma/enums';
import {
  ATTENDANCE_CORRECTION_REASON_MAX_LENGTH,
  ATTENDANCE_CORRECTION_REASON_MIN_LENGTH,
} from '@smarteam/contracts';
export class PunchDto {
  @IsUUID() employeeId!: string;
  @IsDateString() occurredAt!: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) accuracyMeters?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(512) webauthnCredentialId?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsBoolean() manualEntry?: boolean;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) managedByExternalEmployeeId?: string;
  @IsOptional() @IsEnum(AttendanceDayStatus) dayStatus?: AttendanceDayStatus;
}

export class AttendanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/** Filters for the correction request list. Mirrors what the federation surface already accepts. */
export class AttendanceCorrectionQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?:
    'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

/** Selects which branch's attendance policy to read. */
export class AttendancePreferencesQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
}

export class AttendanceCorrectionDto {
  // The same constants the drawer disables its submit button on, so the form cannot accept a
  // reason this DTO will reject.
  @IsString()
  @MinLength(ATTENDANCE_CORRECTION_REASON_MIN_LENGTH)
  @MaxLength(ATTENDANCE_CORRECTION_REASON_MAX_LENGTH)
  reason!: string;
  @IsOptional() @IsObject() afterSnapshot?: Record<string, unknown>;
}

export class AttendanceDecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(2) @MaxLength(500) comment!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) decidedByExternalEmployeeId?: string;
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
  @IsOptional() @IsEnum(['SINGLE', 'MULTIPLE']) attendanceSessionMode?: 'SINGLE' | 'MULTIPLE';
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkLocationDto)
  workLocations?: WorkLocationDto[];
}
