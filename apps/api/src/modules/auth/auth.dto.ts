import { IsAcceptablePassword } from './password-rule';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  IsTimeZone,
} from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsText } from '../../common/validation/field-rules';

export class RegisterDto {
  @IsText('Organization name', LIMITS.title, 2) organizationName!: string;
  @IsTimeZone({ message: 'Choose a time zone from the list, like Asia/Kolkata.' })
  timezone!: string;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsEmail() email!: string;
  @IsText('Your name', LIMITS.title, 2) displayName!: string;
  @IsString() @IsAcceptablePassword() password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(1024) password!: string;
  /**
   * Optional tenant *selection*. It is never an authorization input: the server honours it
   * only when the authenticated user holds an ACTIVE membership of that organization. A user
   * with several memberships and no selection receives ORGANIZATION_SELECTION_REQUIRED.
   */
  @IsOptional() @IsUUID() organizationId?: string;
}

export class PlatformLoginDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(1024) password!: string;
}

export class PasswordResetRequestDto {
  @IsEmail() email!: string;
  @IsUUID() organizationId!: string;
}

export class PasswordResetConfirmDto {
  @IsString() @MinLength(32) @MaxLength(512) token!: string;
  @IsString() @IsAcceptablePassword() password!: string;
}

export class InvitationAcceptDto {
  @IsString() @MinLength(32) @MaxLength(512) token!: string;
  @IsText('Your name', LIMITS.title, 2) displayName!: string;
  @IsString() @IsAcceptablePassword() password!: string;
}

/**
 * Redeeming an employee access code.
 *
 * `code` is only loosely constrained on purpose: the service normalizes case and separators, so
 * rejecting a shape here would refuse codes that are perfectly correct but typed with the dashes
 * left out. Whether the code is real is settled by looking it up, not by its formatting.
 */
export class AccessCodePreviewDto {
  @IsString() @MinLength(8) @MaxLength(64) code!: string;
}

export class AccessCodeActivateDto {
  @IsString() @MinLength(8) @MaxLength(64) code!: string;
  @IsEmail() email!: string;
  @IsString() @IsAcceptablePassword() password!: string;
}
