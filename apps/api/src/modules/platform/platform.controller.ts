import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  ProjectDeactivationDto,
  ProjectDto,
  ProjectMemberDto,
  TeamDeactivationDto,
  TeamDto,
  TeamMemberDto,
  UpdateProjectDto,
  UpdateTeamDto,
} from './platform.dto';
import { TeamsProjectsService } from './teams-projects.service';

@Controller('v1/organizations/:organizationId')
@UseGuards(NativeJwtGuard)
export class PlatformController {
  constructor(
    private readonly teamsProjects: TeamsProjectsService,
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
      .then((context) => this.teamsProjects.addTeamMember(context, teamId, body));
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
      .then((context) => this.teamsProjects.addProjectMember(context, projectId, body));
  }
}
