import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApprovalDomain, ApproverType } from '../../generated/prisma/enums';

export class FederatedApprovalRoleQueryDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
}

export class FederatedApprovalStepDto {
  @IsInt() @Min(1) stepNumber!: number;
  @IsEnum(ApproverType) approverType!: ApproverType;
  @IsOptional() @IsString() @MinLength(1) roleCode?: string;
  @IsOptional() @IsString() @MinLength(1) approverExternalEmployeeId?: string;
  @IsBoolean() @IsOptional() required?: boolean;
}

export class FederatedApprovalPolicyDto {
  @IsEnum(ApprovalDomain) domain!: ApprovalDomain;
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @ValidateNested({ each: true })
  @Type(() => FederatedApprovalStepDto)
  steps!: FederatedApprovalStepDto[];
}

export class FederatedApprovalPolicyPatchDto {
  @IsOptional() @IsString() @MinLength(2) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsBoolean() @IsOptional() isDefault?: boolean;
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FederatedApprovalStepDto)
  steps?: FederatedApprovalStepDto[];
}
