import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';

export class FederationTokenDto {
  @IsIn(['client_credentials']) grant_type!: 'client_credentials';
  @IsString() @MinLength(1) client_id!: string;
  @IsString() @MinLength(1) client_secret!: string;
}

export class ProvisionTenantDto {
  @IsString() name!: string;
  @IsString() timezone!: string;
  @IsString() currencyCode!: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class ProvisionBranchDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']) status?:
    'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  @IsOptional() address?: Record<string, unknown>;
}

export class FederatedEmployeeDto {
  @IsOptional() @IsString() externalId?: string;
  @IsString() employeeNumber!: string;
  @IsString() firstName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() workEmail?: string;
  @IsOptional() @IsIn(Object.values(EmployeeStatus)) status?: EmployeeStatus;
  @IsOptional() @IsIn(Object.values(EmploymentType)) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() dateOfJoining?: string;
  @IsOptional() @IsUUID() primaryBranchId?: string;
  @IsOptional() @IsString() externalVersion?: string;
}

export class WebhookSubscriptionDto {
  @IsString() callbackUrl!: string;
  @IsArray() @IsString({ each: true }) eventTypes!: string[];
  @IsUUID() organizationId!: string;
}

export class FederatedBranchAssignmentDto {
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsIn([true, false]) isPrimary?: boolean;
}
export class FederatedAccessDto {
  @IsArray() @IsString({ each: true }) permissionKeys!: string[];
}
export class FederatedAssertionBeginDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() credentialId?: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
}
export class FederatedWebauthnCompleteDto {
  @IsUUID() challengeId!: string;
  @IsString() response!: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
  @IsOptional() @IsString() deviceLabel?: string;
}
export class FederationReasonDto {
  @IsString() @MinLength(2) reason!: string;
}
export class FederationDeviceLabelDto {
  @IsOptional() @IsString() deviceLabel?: string;
}
export class FederatedWorkLocationDto {
  @IsString() @MinLength(2) name!: string;
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsNumber() @Min(1) radiusMeters!: number;
}
export class FederatedPreferencesDto {
  @IsOptional() @IsIn(['DISABLED', 'FLAG_ONLY', 'REQUIRED']) geofenceMode?:
    'DISABLED' | 'FLAG_ONLY' | 'REQUIRED';
  @IsOptional() @IsIn(['DISABLED', 'OPTIONAL', 'REQUIRED']) biometricVerificationMode?:
    'DISABLED' | 'OPTIONAL' | 'REQUIRED';
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FederatedWorkLocationDto)
  workLocations?: FederatedWorkLocationDto[];
}
export class FederatedLeaveBalanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
}
export class FederatedAttendanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
export class FederatedLeaveAdjustmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsNumber() amount!: number;
  @IsString() @MinLength(5) reason!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}
