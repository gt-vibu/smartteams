import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { RoleAssignmentDto, RoleDto } from './users.dto';
import { RbacAdminService } from './rbac-admin.service';

@Controller('v1/organizations/:organizationId')
@UseGuards(NativeJwtGuard)
export class UsersController {
  constructor(
    private readonly rbac: RbacAdminService,
    private readonly contexts: DomainContextFactory,
  ) {}
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
}
