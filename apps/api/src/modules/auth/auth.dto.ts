import { IsEmail, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) organizationName!: string;
  @IsString() @MinLength(2) timezone!: string;
  @IsString() @Length(3, 3) currencyCode!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsString() @MinLength(12) password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  /**
   * Optional tenant *selection*. It is never an authorization input: the server honours it
   * only when the authenticated user holds an ACTIVE membership of that organization. A user
   * with several memberships and no selection receives ORGANIZATION_SELECTION_REQUIRED.
   */
  @IsOptional() @IsUUID() organizationId?: string;
}

export class PlatformLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class PasswordResetRequestDto {
  @IsEmail() email!: string;
  @IsUUID() organizationId!: string;
}

export class PasswordResetConfirmDto {
  @IsString() @MinLength(32) token!: string;
  @IsString() @MinLength(12) password!: string;
}

export class InvitationAcceptDto {
  @IsString() @MinLength(32) token!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsString() @MinLength(12) password!: string;
}
