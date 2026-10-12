import { LIMITS } from '@smarteam/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsCode, IsText, IsWholeNumber } from '../../common/validation/field-rules';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';

export class ApprovalStepDto {
  @IsWholeNumber('Step', 1, 20) stepNumber!: number;
  @IsEnum(ApproverType) approverType!: ApproverType;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsUUID() approverUserId?: string;
  @IsBoolean() @IsOptional() required?: boolean;
}

export class AutomationPreviewDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
  @IsObject() automation!: Record<string, unknown>;
  @IsOptional() @IsUUID() cursor?: string;
}

export class ApprovalPolicyDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
  @IsCode('Code') code!: string;
  @IsText('Name', LIMITS.title, 2) name!: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsOptional() @IsObject() automation?: Record<string, unknown>;
  @ArrayMaxSize(20, { message: 'A workflow can have at most 20 steps.' })
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

export class UpdateApprovalPolicyDto {
  @IsOptional() @IsCode('Code') code?: string;
  @IsOptional() @IsText('Name', LIMITS.title, 2) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsObject() automation?: Record<string, unknown>;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps?: ApprovalStepDto[];
}

export class ApprovalPolicyDeactivationDto {
  @IsText('Reason', LIMITS.reason, 2) reason!: string;
}

export class ExistingAutomationDto extends AutomationPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids!: string[];
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}
