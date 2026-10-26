import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApprovalBatchItemDto {
  @IsUUID() id!: string;
  @IsEnum(['LEAVE', 'ATTENDANCE_CORRECTION']) domain!: 'LEAVE' | 'ATTENDANCE_CORRECTION';
  @IsInt() @Min(1) @Max(20) expectedStepNumber!: number;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
}
export class ApprovalBatchDto {
  @IsUUID() batchId!: string;
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ApprovalBatchItemDto)
  items!: ApprovalBatchItemDto[];
}
