import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LIMITS } from '@smarteam/contracts';
import {
  IsAadhaar,
  IsCalendarDate,
  IsCode,
  IsEmailAddress,
  IsPersonName,
  IsPhoneNumber,
  yearsFromToday,
} from '../../common/validation/field-rules';
import {
  EmployeeStatus,
  EmploymentType,
  PayFrequency,
  PayType,
} from '../../generated/prisma/enums';

export class CreateEmployeeDto {
  /** Optional when `departmentId` names a department with a number series: it is taken from it. */
  @IsOptional() @IsCode('Employee ID', LIMITS.employeeNumber) employeeNumber?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsPersonName('First name') firstName!: string;
  @IsOptional() @IsPersonName('Middle name') middleName?: string;
  @IsPersonName('Last name') lastName!: string;
  @IsOptional() @IsPersonName('Preferred name') preferredName?: string;
  @IsOptional() @IsEmailAddress() workEmail?: string;
  @IsOptional() @IsEmailAddress() personalEmail?: string;
  /** A calling code and number; an Indian number is 10 digits starting 6–9. */
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;
  @IsOptional()
  @IsCalendarDate('Joining date', { earliest: '1950-01-01', latest: yearsFromToday(1) })
  dateOfJoining?: string;
  @IsOptional() @IsUUID() primaryBranchId?: string;
  /** Required. Spaces are allowed as printed on the card; the check digit is verified. */
  @IsAadhaar()
  aadhaarNumber!: string;
  /** Set when onboarding will create a login next, so a taken address is refused up front. */
  @IsOptional() @IsBoolean() createLogin?: boolean;
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
  @IsOptional() @IsPersonName('First name') firstName?: string;
  @IsOptional() @IsPersonName('Middle name') middleName?: string;
  @IsOptional() @IsPersonName('Last name') lastName?: string;
  @IsOptional() @IsPersonName('Preferred name') preferredName?: string;
  @IsOptional() @IsEmailAddress() workEmail?: string;
  @IsOptional() @IsEmailAddress() personalEmail?: string;
  /** A calling code and number; an Indian number is 10 digits starting 6–9. */
  @IsOptional() @IsPhoneNumber() phone?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() primaryBranchId?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional()
  @IsCalendarDate('Joining date', { earliest: '1950-01-01', latest: yearsFromToday(1) })
  dateOfJoining?: string;
}

export class BranchAssignmentDto {
  @IsUUID() branchId!: string;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class EmployeeDeactivationDto {
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
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

export class EmployeePersonalProfileDto {
  @IsOptional() @IsString() @MaxLength(120) fatherName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) motherName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) spouseName?: string | null;
  @IsOptional() @Matches(/^\d{12}$/) aadhaarNumber?: string | null;
  @IsOptional() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/) panNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(500) presentAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(500) permanentAddress?: string | null;
}

export class EmployeeBankAccountDto {
  @IsOptional() @IsString() @MaxLength(160) bankName?: string | null;
  @IsOptional() @Matches(/^\d{9,18}$/) accountNumber?: string | null;
  @IsOptional() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/) ifscCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) accountHolderName?: string | null;
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class EmployeeReferenceDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) relationship?: string | null;
  @Matches(/^\+?[0-9]{10,15}$/) phone!: string;
  @IsOptional() @IsString() @MaxLength(40) referenceType?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class EmployeeReferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeReferenceDto)
  references!: EmployeeReferenceDto[];
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

/**
 * Issuing an employee access code.
 *
 * `roleIds` are the roles the employee holds once they activate. Empty is the normal case and
 * means the baseline employee role only; anything listed is checked against the issuer's own
 * permissions before the code is created.
 */
export class AccessCodeIssueDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) roleIds?: string[];
}
