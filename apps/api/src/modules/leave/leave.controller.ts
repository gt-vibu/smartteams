import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  LeaveAdjustmentDto,
  LeaveCancelDto,
  LeaveDecisionDto,
  LeaveRequestDto,
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
