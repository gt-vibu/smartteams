import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsCode, IsText, IsWholeNumber } from '../../common/validation/field-rules';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';

export class ApprovalStepDto {
  @IsWholeNumber('Step', 1, 20) stepNumber!: number;
  @IsEnum(ApproverType) approverType!: ApproverType;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsUUID() approverUserId?: string;
  @IsBoolean() @IsOptional() required?: boolean;
}

export class ApprovalPolicyDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
  @IsCode('Code') code!: string;
  @IsText('Name', LIMITS.title, 2) name!: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @ArrayMaxSize(20, { message: 'A workflow can have at most 20 steps.' })
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

export class UpdateApprovalPolicyDto {
  @IsOptional() @IsCode('Code') code?: string;
  @IsOptional() @IsText('Name', LIMITS.title, 2) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps?: ApprovalStepDto[];
}

export class ApprovalPolicyDeactivationDto {
  @IsText('Reason', LIMITS.reason, 2) reason!: string;
}
