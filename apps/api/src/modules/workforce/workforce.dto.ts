import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkforceFilterDto {
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsEnum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']) employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  branchIds?: string[];
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10000)
  @IsUUID(undefined, { each: true })
  employeeIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10000)
  @IsUUID(undefined, { each: true })
  excludeEmployeeIds?: string[];
  @IsOptional() @IsBoolean() allEmployees?: boolean;
}
export class WorkforceSalaryDto {
  @IsNumber() @Min(0.01) @Max(100000000) grossSalary!: number;
  @IsBoolean() pfEnabled!: boolean;
  @IsBoolean() esiEnabled!: boolean;
  @IsBoolean() ptEnabled!: boolean;
}
export class WorkforcePreviewDto {
  @IsOptional() @ValidateNested() @Type(() => WorkforceSalaryDto) salary?: WorkforceSalaryDto;
  @IsEnum(['PAYROLL_POLICY', 'SHIFT', 'MANAGER', 'LEAVE_POLICY', 'SALARY']) operation!:
    'PAYROLL_POLICY' | 'SHIFT' | 'MANAGER' | 'LEAVE_POLICY' | 'SALARY';
  @IsUUID() targetId!: string;
  @IsDateString({ strict: true }) effectiveFrom!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsDefined() @ValidateNested() @Type(() => WorkforceFilterDto) filter!: WorkforceFilterDto;
}
export class WorkforceStartDto extends WorkforcePreviewDto {
  @IsUUID() batchId!: string;
  @IsString() @MinLength(64) @MaxLength(64) fingerprint!: string;
}
