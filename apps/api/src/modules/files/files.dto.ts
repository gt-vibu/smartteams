import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  Matches,
  Max,
} from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsText } from '../../common/validation/field-rules';
import { EMPLOYEE_DOCUMENT_TYPES, type EmployeeDocumentType } from './file.constants';
export class FileUploadDto {
  @IsEnum([
    'PROFILE_IMAGE',
    'RESUME',
    'EMPLOYEE_DOCUMENT',
    'LEAVE_ATTACHMENT',
    'PAYSLIP',
    'PAYROLL_EXPORT',
    'IMPORT',
    'OTHER',
  ])
  purpose!: FilePurpose;
  @IsString() @MaxLength(255) originalName!: string;
  @IsString() @MaxLength(120) contentType!: string;
  @IsNumber() @Min(1) byteSize!: number;
  @IsOptional() @Matches(/^[a-fA-F0-9]{64}$/) checksumSha256?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() leaveRequestId?: string;
  @IsOptional() @IsIn(EMPLOYEE_DOCUMENT_TYPES) documentType?: EmployeeDocumentType;
}
export class FileQueryDto {
  @IsOptional()
  @IsEnum([
    'PROFILE_IMAGE',
    'RESUME',
    'EMPLOYEE_DOCUMENT',
    'LEAVE_ATTACHMENT',
    'PAYSLIP',
    'PAYROLL_EXPORT',
    'IMPORT',
    'OTHER',
  ])
  purpose?: FilePurpose;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) limit?: number;
}
export class FileDeleteDto {
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}
import type { FilePurpose } from '../../generated/prisma/enums';

export class DocumentQueryDto {
  @IsOptional()
  @IsIn(['all', 'mine', 'shared', 'organization', 'team', 'project', 'employees', 'internal'])
  section?:
    'all' | 'mine' | 'shared' | 'organization' | 'team' | 'project' | 'employees' | 'internal';
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

/** Null clears it. */
export class DocumentExpiryDto {
  @ValidateIf((_, value) => value !== null) @IsDateString() expiresOn!: string | null;
}

export class DocumentUploadDto extends FileUploadDto {
  @IsIn(['PERSONAL', 'EMPLOYEE', 'TEAM', 'PROJECT', 'ORGANIZATION'])
  scope!: 'PERSONAL' | 'EMPLOYEE' | 'TEAM' | 'PROJECT' | 'ORGANIZATION';
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsBoolean() allowDownload?: boolean;
}

export class FileShareDto {
  @IsIn(['USER', 'ROLE', 'TEAM']) granteeType!: 'USER' | 'ROLE' | 'TEAM';
  /** The user, role or team. For a person the website sends `granteeEmployeeId` instead. */
  @IsOptional() @IsUUID() granteeId?: string;
  @IsOptional() @IsUUID() granteeEmployeeId?: string;
  @IsOptional() @IsBoolean() canDownload?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}
