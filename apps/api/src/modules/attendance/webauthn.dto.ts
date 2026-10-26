import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsText } from '../../common/validation/field-rules';

export class BeginEnrollmentDto {
  @IsOptional() @IsText('Device name', 60) deviceLabel?: string;
}

export class CompleteEnrollmentDto {
  @IsUUID() challengeId!: string;
  @IsString() @MaxLength(20_000) response!: string;
  @IsOptional() @IsText('Device name', 60) deviceLabel?: string;
}

export class BeginAssertionDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() @MaxLength(1024) credentialId?: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
}

export class CompleteAssertionDto {
  @IsUUID() challengeId!: string;
  @IsString() @MaxLength(20_000) response!: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
}

export class RevokeCredentialDto {
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}
