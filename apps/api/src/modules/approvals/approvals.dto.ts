import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';

export class ApprovalStepDto {
  @IsInt() @Min(1) stepNumber!: number;
  @IsEnum(ApproverType) approverType!: ApproverType;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsUUID() approverUserId?: string;
  @IsBoolean() @IsOptional() required?: boolean;
}

export class ApprovalPolicyDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @ValidateNested({ each: true }) @Type(() => ApprovalStepDto) steps!: ApprovalStepDto[];
}

export class UpdateApprovalPolicyDto {
  @IsOptional() @IsString() @MinLength(2) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps?: ApprovalStepDto[];
}

export class ApprovalPolicyDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}
