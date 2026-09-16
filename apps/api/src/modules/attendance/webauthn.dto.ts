import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class BeginEnrollmentDto {
  @IsOptional() @IsString() deviceLabel?: string;
}

export class CompleteEnrollmentDto {
  @IsUUID() challengeId!: string;
  @IsString() response!: string;
  @IsOptional() @IsString() deviceLabel?: string;
}

export class BeginAssertionDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() credentialId?: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
}

export class CompleteAssertionDto {
  @IsUUID() challengeId!: string;
  @IsString() response!: string;
  @IsOptional() @IsUUID() attendancePunchId?: string;
}

export class RevokeCredentialDto {
  @IsString() @MinLength(3) reason!: string;
}
