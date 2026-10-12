import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ApprovalExceptionsQueryDto, ApprovalReassignmentDto } from './approval-operations.dto';
import { ApprovalOperationsService } from './approval-operations.service';
import { ApprovalAnalyticsService } from './approval-analytics.service';

@Controller('v1/organizations/:organizationId/approval-operations')
@UseGuards(NativeJwtGuard)
export class ApprovalOperationsController {
  constructor(
    private readonly operations: ApprovalOperationsService,
    private readonly contexts: DomainContextFactory,
    private readonly analytics: ApprovalAnalyticsService,
  ) {}
  @Get('analytics') analyticsOverview(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.analytics.get(context));
  }
  @Get('exceptions') exceptions(
    @Param('organizationId') organizationId: string,
    @Query() query: ApprovalExceptionsQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.operations.exceptions(context, query));
  }
  @Post('reassign') reassign(
    @Param('organizationId') organizationId: string,
    @Body() body: ApprovalReassignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.operations.reassign(context, body));
  }
}
