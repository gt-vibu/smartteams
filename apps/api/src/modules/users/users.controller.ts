import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { MemberDto, RoleAssignmentDto, RoleDto } from './users.dto';
import { RbacAdminService } from './rbac-admin.service';
import { MembersService } from './members.service';

@Controller('v1/organizations/:organizationId')
@UseGuards(NativeJwtGuard)
export class UsersController {
  constructor(
    private readonly rbac: RbacAdminService,
    private readonly members: MembersService,
    private readonly contexts: DomainContextFactory,
  ) {}

  /**
   * The people who can sign in to this organization. Distinct from employees: an employee is a
   * workforce record, a member is a login, and the two are joined by `Employee.userId`.
   */
  @Get('members') memberList(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.members.list(context));
  }
  @Post('members') member(
    @Param('organizationId') organizationId: string,
    @Body() body: MemberDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.members.create(context, body));
  }
  @Get('roles') roles(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rbac.listRoles(context));
  }
  @Post('roles') role(
    @Param('organizationId') organizationId: string,
    @Body() body: RoleDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rbac.createRole(context, body));
  }
  @Post('role-assignments') assignment(
    @Param('organizationId') organizationId: string,
    @Body() body: RoleAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rbac.assign(context, body));
  }
  @Delete('role-assignments/:userRoleId') revoke(
    @Param('organizationId') organizationId: string,
    @Param('userRoleId') userRoleId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rbac.revoke(context, userRoleId));
  }
}
