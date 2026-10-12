import { Type } from 'class-transformer';
import { IsArray, ArrayMaxSize, ArrayUnique, ValidateNested, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import { IsCode, IsText } from '../../common/validation/field-rules';
import { IsEnum, ValidateIf } from 'class-validator';
import { ProjectStatus } from '../../generated/prisma/enums';
export class TeamDto {
  /** Stable client-generated id lets a timed-out create be safely retried. */
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ArrayUnique() @IsUUID('4', { each: true }) memberEmployeeIds?: string[];
  @IsText('Team name', LIMITS.title, 2) name!: string;
  @IsOptional() @IsText('Description', LIMITS.note, 0) description?: string;
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
  @IsOptional() @IsText('Team name', LIMITS.title, 2) name?: string;
  @IsOptional() @IsText('Description', LIMITS.note, 0) description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** `null` removes the lead. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() teamLeadEmployeeId?:
    string | null;
}
export class TeamDeactivationDto {
  @IsText('Reason', LIMITS.reason, 2) reason!: string;
}
export class InitialProjectMemberDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsText('Project role', LIMITS.label) projectRole?: string;
}
export class ProjectDto {
  /** Stable client-generated id lets a timed-out create be safely retried. */
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => InitialProjectMemberDto) members?: InitialProjectMemberDto[];
  /** Left out to have one generated (PRJ-001 …). */
  @IsOptional() @IsCode('Project code') code?: string;
  @IsText('Project name', LIMITS.title, 2) name!: string;
  @IsOptional() @IsText('Description', LIMITS.note, 0) description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsUUID() projectLeadEmployeeId?: string;
}
export class ProjectMemberDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsText('Project role', LIMITS.label) projectRole?: string;
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
}
export class UpdateProjectDto {
  @IsOptional() @IsCode('Project code') code?: string;
  @IsOptional() @IsText('Project name', LIMITS.title, 2) name?: string;
  @IsOptional() @IsText('Description', LIMITS.note, 0) description?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  /** `null` removes the lead. */
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() projectLeadEmployeeId?:
    string | null;
}
export class ProjectDeactivationDto {
  @IsText('Reason', LIMITS.reason, 2) reason!: string;
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
  @IsOptional() @IsText('Project role', LIMITS.label) projectRole?: string;
}
