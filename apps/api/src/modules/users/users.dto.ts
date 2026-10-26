import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsCode, IsEmailAddress, IsText } from '../../common/validation/field-rules';
export class RoleDto {
  @IsCode('Role code', 40) code!: string;
  @IsText('Role name', LIMITS.title, 2) name!: string;
  @IsEnum(['ORGANIZATION', 'BRANCH']) scope!: RoleScope;
  @IsOptional() @IsUUID() branchId?: string;
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissionKeys!: string[];
}
export class RoleAssignmentDto {
  @IsUUID() userId!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
import type { RoleScope } from '../../generated/prisma/enums';

export class MemberDto {
  @IsEmailAddress() email!: string;
  @IsText('Name', LIMITS.title, 2) displayName!: string;
  @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) roleIds!: string[];
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}

/** A role's complete permission set, replacing the one it has, and why it changed. */
export class RolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissionKeys!: string[];
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
