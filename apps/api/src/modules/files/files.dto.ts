import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
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
  @IsString() contentType!: string;
  @IsNumber() @Min(1) byteSize!: number;
  @IsOptional() @IsString() checksumSha256?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() leaveRequestId?: string;
  @IsOptional() @IsIn(EMPLOYEE_DOCUMENT_TYPES) documentType?: EmployeeDocumentType;
}
export class FileDeleteDto {
  @IsString() @MinLength(3) reason!: string;
}
import type { FilePurpose } from '../../generated/prisma/enums';
