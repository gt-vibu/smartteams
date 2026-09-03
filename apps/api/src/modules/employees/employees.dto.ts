import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EmployeeStatus,
  EmploymentType,
  PayFrequency,
  PayType,
} from '../../generated/prisma/enums';

export class CreateEmployeeDto {
  @IsString() @MinLength(1) employeeNumber!: string;
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() workEmail?: string;
  @IsOptional() @IsString() personalEmail?: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsOptional() @IsDateString() dateOfJoining?: string;
  @IsOptional() @IsUUID() primaryBranchId?: string;
}

export class FederatedEmployeeDto {
  @IsString() @MinLength(1) employeeNumber!: string;
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() workEmail?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() dateOfJoining?: string;
  @IsOptional() @IsUUID() primaryBranchId?: string;
  @IsOptional() @IsString() externalVersion?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() workEmail?: string;
  @IsOptional() @IsString() personalEmail?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() primaryBranchId?: string;
}

export class BranchAssignmentDto {
  @IsUUID() branchId!: string;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class EmployeeDeactivationDto {
  @IsString() @MinLength(10) reason!: string;
}

export class EmergencyContactDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) relationship!: string;
  @IsString() @MinLength(5) phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class EmploymentRecordDto {
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsUUID() managerEmployeeId?: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsEnum(EmployeeStatus) status!: EmployeeStatus;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CompensationDto {
  @IsEnum(PayType) payType!: PayType;
  @IsEnum(PayFrequency) payFrequency!: PayFrequency;
  @IsNumber() baseAmount!: number;
  @IsString() @MinLength(3) currencyCode!: string;
  @IsNumber() overtimeMultiplier!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class ManagerAssignmentDto {
  @IsUUID() managerEmployeeId!: string;
}

/** Links an existing organization member's account to an employee record. */
export class UserLinkDto {
  @IsUUID() userId!: string;
}

/**
 * Paging for the employee directory. The service caps `limit` regardless of what arrives here,
 * so a large value is clamped rather than refused.
 */
export class EmployeeListQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsUUID() cursor?: string;
}
