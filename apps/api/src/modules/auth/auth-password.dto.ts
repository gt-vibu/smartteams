import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.password-store';
import { IsAcceptablePassword } from './password-rule';

const newPassword = `must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`;

export class PasswordSetupPreviewDto {
  @IsString() @MinLength(32) @MaxLength(128) token!: string;
}

export class PasswordSetupDto {
  @IsString() @MinLength(32) @MaxLength(128) token!: string;
  @IsString()
  @IsAcceptablePassword()
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `password ${newPassword}` })
  password!: string;
}

export class PasswordCodeRequestDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class PasswordCodeResetDto {
  @IsEmail() @MaxLength(254) email!: string;
  @Matches(/^\d{6}$/, { message: 'code must be the six digits from the email' }) code!: string;
  @IsString()
  @IsAcceptablePassword()
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `password ${newPassword}` })
  password!: string;
}

export class PasswordChangeDto {
  @IsString() @MinLength(1) @MaxLength(PASSWORD_MAX_LENGTH) currentPassword!: string;
  @IsString()
  @IsAcceptablePassword()
  @MaxLength(PASSWORD_MAX_LENGTH, { message: `newPassword ${newPassword}` })
  newPassword!: string;
}
