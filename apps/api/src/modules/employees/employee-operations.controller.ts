import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { EmployeeOperationsService } from './employee-operations.service';
import { EmployeeBulkDto, EmployeeReadinessDto } from './employee-operations.dto';
type Authed = Request & { user: NativeRequestUser };
@Controller('v1/organizations/:organizationId/employee-operations')
@UseGuards(NativeJwtGuard)
export class EmployeeOperationsController {
  constructor(
    private readonly operations: EmployeeOperationsService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get('readiness') list(
    @Param('organizationId') org: string,
    @Req() request: Authed,
    @Query() query: EmployeeReadinessDto,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((ctx) => this.operations.readiness(ctx, query.cursor));
  }
  @Post('preview') preview(
    @Param('organizationId') org: string,
    @Req() request: Authed,
    @Body() body: EmployeeBulkDto,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((ctx) => this.operations.preview(ctx, body));
  }
  @Post('apply') apply(
    @Param('organizationId') org: string,
    @Req() request: Authed,
    @Body() body: EmployeeBulkDto,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((ctx) => this.operations.apply(ctx, body));
  }
}
