import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
export class FederationClientDto {
  @IsString() @MinLength(2) name!: string;
  @IsIn([true]) mtlsRequired!: true;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) allowedCertificateFingerprints!: string[];
  @IsOptional() @IsUUID() homeOrganizationId?: string;
  @IsString() @MinLength(5) reason!: string;
}
export class CredentialRotationDto {
  @IsString() @MinLength(5) reason!: string;
}
export class CredentialRevokeDto {
  @IsString() @MinLength(5) reason!: string;
}
export class ClientStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']) status!: FederationClientStatus;
  @IsString() @MinLength(5) reason!: string;
}
export class GrantDto {
  @IsUUID() clientId!: string;
  @IsUUID() organizationId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) roleIds?: string[];
  @IsEnum(['ALLOW', 'DENY']) effect!: GrantEffect;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsString() @MinLength(5) reason!: string;
}
import type { FederationClientStatus, GrantEffect } from '../../generated/prisma/enums';
