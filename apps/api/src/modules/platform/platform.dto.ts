import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsEnum, ValidateIf } from 'class-validator';
import { ProjectStatus } from '../../generated/prisma/enums';
export class TeamDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() teamLeadEmployeeId?: string;
}
export class TeamMemberDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() @MaxLength(80) teamRole?: string;
  @IsDateString() joinedAt!: string;
}
/** A current member's role in the team; empty clears it. */
export class UpdateTeamMemberDto {
  @IsOptional() @IsString() @MaxLength(80) teamRole?: string;
}
export class UpdateTeamDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** `null` removes the lead. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() teamLeadEmployeeId?:
    string | null;
}
export class TeamDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}
export class ProjectDto {
  /** Left out to have one generated (PRJ-001 …). */
  @IsOptional() @IsString() code?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsUUID() projectLeadEmployeeId?: string;
}
export class ProjectMemberDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() projectRole?: string;
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
  /** `null` removes the lead. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() projectLeadEmployeeId?:
    string | null;
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

/** What may change on a project assignment without rewriting history: the role. */
export class UpdateProjectMemberDto {
  @IsOptional() @IsString() projectRole?: string;
}
