import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
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
  @IsString() originalName!: string;
  @IsString() contentType!: string;
  @IsNumber() @Min(1) byteSize!: number;
  @IsOptional() @IsString() checksumSha256?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() leaveRequestId?: string;
}
export class FileDeleteDto {
  @IsString() @MinLength(3) reason!: string;
}
import type { FilePurpose } from '../../generated/prisma/enums';
