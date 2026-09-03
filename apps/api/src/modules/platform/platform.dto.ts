import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { IsEnum } from 'class-validator';
import { ProjectStatus } from '../../generated/prisma/enums';
export class TeamDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() teamLeadEmployeeId?: string;
}
export class TeamMemberDto {
  @IsUUID() employeeId!: string;
  @IsDateString() joinedAt!: string;
}
export class UpdateTeamDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() teamLeadEmployeeId?: string;
}
export class TeamDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}
export class ProjectDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
export class ProjectMemberDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() projectRole?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) allocationPercentage?: number;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
}
export class UpdateProjectDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
export class ProjectDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}

/** Soft-closes a team membership by setting `leftAt`. */
export class EndTeamMemberDto {
  @IsDateString() leftAt!: string;
}

/** Soft-closes a project allocation by setting `endsOn`. */
export class EndProjectMemberDto {
  @IsDateString() endsOn!: string;
}

/** The two fields of a project assignment that may change without rewriting history. */
export class UpdateProjectMemberDto {
  @IsOptional() @IsString() projectRole?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) allocationPercentage?: number;
}
