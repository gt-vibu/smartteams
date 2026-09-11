import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
export class RoleDto {
  @IsString() code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsEnum(['ORGANIZATION', 'BRANCH']) scope!: RoleScope;
  @IsOptional() @IsUUID() branchId?: string;
  @IsArray() @IsString({ each: true }) permissionKeys!: string[];
}
export class RoleAssignmentDto {
  @IsUUID() userId!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
import type { RoleScope } from '../../generated/prisma/enums';

export class MemberDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) roleIds!: string[];
  @IsString() @MinLength(3) reason!: string;
}
