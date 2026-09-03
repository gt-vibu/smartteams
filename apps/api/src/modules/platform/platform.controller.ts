import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  EndProjectMemberDto,
  EndTeamMemberDto,
  ProjectDeactivationDto,
  ProjectDto,
  ProjectMemberDto,
  UpdateProjectMemberDto,
  TeamDeactivationDto,
  TeamDto,
  TeamMemberDto,
  UpdateProjectDto,
  UpdateTeamDto,
} from './platform.dto';
import { MembershipService } from './membership.service';
import { TeamsProjectsService } from './teams-projects.service';

@Controller('v1/organizations/:organizationId')
@UseGuards(NativeJwtGuard)
export class PlatformController {
  constructor(
    private readonly teamsProjects: TeamsProjectsService,
    private readonly membership: MembershipService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get('teams') teams(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.listTeams(context));
  }
  @Post('teams') team(
    @Param('organizationId') organizationId: string,
    @Body() body: TeamDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.createTeam(context, body));
  }
  @Patch('teams/:teamId') updateTeam(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() body: UpdateTeamDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.updateTeam(context, teamId, body));
  }
  @Post('teams/:teamId/archive') archiveTeam(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() body: TeamDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.teamsProjects.archiveTeam(context, teamId, body.reason));
  }
  @Post('teams/:teamId/members') teamMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() body: TeamMemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.membership.addTeamMember(context, teamId, body));
  }
  @Post('teams/:teamId/members/:memberId/end') endTeamMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Body() body: EndTeamMemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.membership.endTeamMembership(context, teamId, memberId, body));
  }
  @Get('projects') projects(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.listProjects(context));
  }
  @Post('projects') project(
    @Param('organizationId') organizationId: string,
    @Body() body: ProjectDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.createProject(context, body));
  }
  @Patch('projects/:projectId') updateProject(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() body: UpdateProjectDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.teamsProjects.updateProject(context, projectId, body));
  }
  @Post('projects/:projectId/archive') archiveProject(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() body: ProjectDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.teamsProjects.archiveProject(context, projectId, body.reason));
  }
  @Post('projects/:projectId/members') projectMember(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Body() body: ProjectMemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.membership.addProjectMember(context, projectId, body));
  }
  @Patch('projects/:projectId/members/:memberId') updateProjectMember(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateProjectMemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.membership.updateProjectMember(context, projectId, memberId, body));
  }
  @Post('projects/:projectId/members/:memberId/end') endProjectMember(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() body: EndProjectMemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.membership.endProjectMembership(context, projectId, memberId, body));
  }
}
