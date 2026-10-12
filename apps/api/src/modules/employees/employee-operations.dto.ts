import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/field-rules';
export class EmployeeReadinessDto {
  @IsOptional() @IsUUID() cursor?: string;
}
export class EmployeeBulkDto {
  @IsEnum(['MANAGER', 'SHIFT']) kind!: 'MANAGER' | 'SHIFT';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
  @IsUUID() targetId!: string;
  @ValidateIf((value: EmployeeBulkDto) => value.kind === 'SHIFT')
  @IsCalendarDate('Starts on')
  startsOn?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(64) fingerprint?: string;
}
