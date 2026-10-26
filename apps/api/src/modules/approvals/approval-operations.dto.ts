import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ApprovalExceptionsQueryDto {
  @IsEnum(['LEAVE', 'ATTENDANCE_CORRECTION']) domain!: 'LEAVE' | 'ATTENDANCE_CORRECTION';
  @IsOptional() @IsUUID() cursor?: string;
}
export class ApprovalReassignmentDto {
  @IsEnum(['LEAVE', 'ATTENDANCE_CORRECTION']) domain!: 'LEAVE' | 'ATTENDANCE_CORRECTION';
  @IsUUID() requestId!: string;
  @IsUUID() approverUserId!: string;
  @IsInt() @Min(1) @Max(20) expectedStepNumber!: number;
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}
