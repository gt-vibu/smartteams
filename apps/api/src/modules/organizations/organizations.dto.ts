import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsCode, IsPersonName, IsText, withRules } from '../../common/validation/field-rules';

export class OnboardOrganizationDto {
  @IsText('Organization name', LIMITS.title, 2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsString() @MinLength(2) timezone!: string;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsEmail() adminEmail!: string;
  @IsPersonName('Administrator name') adminDisplayName!: string;
  @IsOptional() @IsText('Reason', LIMITS.reason) reason?: string;
}

export class CreateOrganizationDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) timezone!: string;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsOptional() @IsEnum(['NATIVE', 'BLIZBOOKS']) source?: 'NATIVE' | 'BLIZBOOKS';
  @IsOptional() @IsString() externalId?: string;
  @IsString() @MinLength(10) reason!: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsText('Organization name', LIMITS.title, 2) name?: string;
  /** A real IANA zone: attendance days and automatic check-out are worked out in it. */
  @IsOptional() @IsTimeZone() timezone?: string;
  @IsOptional() @IsString() @Length(3, 3) currencyCode?: string;
}

export class SourceChangeDto {
  @IsEnum(['NATIVE', 'BLIZBOOKS']) toSource!: 'NATIVE' | 'BLIZBOOKS';
  @IsString() @MinLength(10) reason!: string;
}

export class BranchDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(1) code!: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() address?: Record<string, unknown>;
}

export class UpdateBranchDto {
  @IsOptional() @IsText('Branch name', LIMITS.title, 2) name?: string;
  @IsOptional() @IsCode('Branch code') code?: string;
  @IsOptional() address?: Record<string, unknown>;
  /** IANA name, e.g. Asia/Kolkata. Empty clears it, and the branch follows the organization. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsTimeZone({ message: 'Choose a time zone from the list, like Asia/Kolkata.' })
  timezone?: string;
}

/** A branch created in the app. Federation provisions branches through its own, frozen DTO. */
export class NativeBranchDto extends BranchDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsTimeZone({ message: 'Choose a time zone from the list, like Asia/Kolkata.' })
  timezone?: string;
}
withRules(NativeBranchDto, {
  name: [IsText('Branch name', LIMITS.title, 2)],
  code: [IsCode('Branch code')],
});

export class BranchDeactivationDto {
  @IsText('Reason', LIMITS.reason, 10) reason!: string;
}

export class PrimaryBranchDto {
  @IsUUID() branchId!: string;
}

export class FederationTenantSyncDto extends CreateOrganizationDto {
  @IsOptional() @IsEnum(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class FederationBranchSyncDto extends BranchDto {
  @IsUUID() organizationId!: string;
}
