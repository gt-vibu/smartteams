import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  LeaveAdjustmentDto,
  LeaveBalanceQueryDto,
  LeaveCancelDto,
  LeaveDecisionDto,
  LeaveRequestDto,
  LeaveRequestQueryDto,
  LeavePolicyAssignmentDto,
  LeaveTypeDto,
} from './leave.dto';
import { LeaveService } from './leave.service';

@Controller('v1/organizations/:organizationId/leave')
@UseGuards(NativeJwtGuard)
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly contexts: DomainContextFactory,
  ) {}

  /**
   * Leave requests, balances and the approval inbox.
   *
   * All three service methods have existed since the module was written and are reachable over
   * the federation surface, but the native controller exposed only writes — the app could submit
   * a leave request and never list one, and could adjust a balance it could not read. No service
   * or federation change; these are the missing HTTP entry points.
   */
  @Get('requests') requests(
    @Param('organizationId') organizationId: string,
    @Query() query: LeaveRequestQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.leave.listRequests(context, query.employeeId, {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
  }

  /** Requests awaiting the signed-in user's decision. */
  @Get('requests/inbox') requestInbox(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.listPendingApprovals(context, request.user.userId));
  }

  @Get('balances') balances(
    @Param('organizationId') organizationId: string,
    @Query() query: LeaveBalanceQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.listBalances(context, query.employeeId));
  }

  @Get('types') types(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.listTypes(context));
  }
  @Post('types') createType(
    @Param('organizationId') organizationId: string,
    @Body() body: LeaveTypeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.createType(context, body));
  }
  @Get('assignments') assignments(
    @Param('organizationId') organizationId: string,
    @Query('branchId') branchId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, branchId)
      .then((context) => this.leave.listAssignments(context));
  }
  @Post('types/:code/assign') assignType(
    @Param('organizationId') organizationId: string,
    @Param('code') code: string,
    @Body() body: LeavePolicyAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, body.branchId)
      .then((context) => this.leave.assignTypeToBranch(context, code));
  }
  @Post('requests') request(
    @Param('organizationId') organizationId: string,
    @Body() body: LeaveRequestDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.createRequest(context, { ...body, source: 'NATIVE' }));
  }
  @Post('requests/:requestId/decision') decision(
    @Param('organizationId') organizationId: string,
    @Param('requestId') requestId: string,
    @Body() body: LeaveDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.comment)
      .then((context) => this.leave.decide(context, requestId, body.status, body.comment));
  }
  @Post('requests/:requestId/cancel') cancel(
    @Param('organizationId') organizationId: string,
    @Param('requestId') requestId: string,
    @Body() body: LeaveCancelDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.leave.cancel(context, requestId, body.reason));
  }
  @Post('balances/adjust') adjust(
    @Param('organizationId') organizationId: string,
    @Body() body: LeaveAdjustmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.leave.adjustBalance(context, body));
  }
}
