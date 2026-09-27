import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';

export class OnboardOrganizationDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsString() @MinLength(2) timezone!: string;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsEmail() adminEmail!: string;
  @IsString() @MinLength(2) adminDisplayName!: string;
  @IsOptional() @IsString() reason?: string;
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
  @IsOptional() @IsString() @MinLength(2) name?: string;
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
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() address?: Record<string, unknown>;
  /** IANA name, e.g. Asia/Kolkata. Empty clears it, and the branch follows the organization. */
  @IsOptional() @IsString() timezone?: string;
}

/** A branch created in the app. Federation provisions branches through its own, frozen DTO. */
export class NativeBranchDto extends BranchDto {
  @IsOptional() @IsString() timezone?: string;
}

export class BranchDeactivationDto {
  @IsString() @MinLength(10) reason!: string;
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
