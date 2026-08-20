import { IsEnum, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';

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
  @IsOptional() @IsString() timezone?: string;
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
}

export class BranchDeactivationDto {
  @IsString() @MinLength(10) reason!: string;
}

export class FederationTenantSyncDto extends CreateOrganizationDto {
  @IsOptional() @IsEnum(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class FederationBranchSyncDto extends BranchDto {
  @IsUUID() organizationId!: string;
}
