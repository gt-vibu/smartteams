import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ComplianceRecordStatus } from '../../generated/prisma/enums';

export class StatutoryProfileDto {
  @IsString() @Matches(/^[A-Z0-9._-]{2,40}$/) schemeCode!: string;
  @IsOptional() @IsString() @MaxLength(120) registrationNumber?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsNumber() @Min(0) employeeRate?: number;
  @IsOptional() @IsNumber() @Min(0) employerRate?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class StatutoryRecordDto {
  @IsString() @Matches(/^[A-Z0-9._-]{2,40}$/) schemeCode!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsEnum(ComplianceRecordStatus) status?: ComplianceRecordStatus;
  @IsOptional() @IsNumber() @Min(0) employeeAmount?: number;
  @IsOptional() @IsNumber() @Min(0) employerAmount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(160) filingReference?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class StatutoryRecordWriteDto extends StatutoryRecordDto {
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class ComplianceQueryDto {
  @IsOptional() @IsString() @MaxLength(40) schemeCode?: string;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
}
