import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { ApprovalInboxQueryDto } from '../approvals/approval-inbox.dto';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { LeaveAttachmentsService } from './leave-attachments.service';
import { LeaveCalendarService } from './leave-calendar.service';
import {
  LeaveAdjustmentDto,
  LeaveBalanceQueryDto,
  LeaveCalendarQueryDto,
  LeaveCancelDto,
  LeavePolicyAssignmentDto,
  LeaveRequestQueryDto,
} from './leave.dto';
import { LeaveService } from './leave.service';

import {
  NativeLeaveDecisionDto,
  LeaveDateAvailabilityDto,
  NativeLeaveRequestDto,
  NativeLeaveTypeDto,
  NativeLeaveTypeUpdateDto,
} from './leave-native.dto';
@Controller('v1/organizations/:organizationId/leave')
@UseGuards(NativeJwtGuard)
export class LeaveController {
  @Post('requests/date-availability') dateAvailability(
    @Param('organizationId') organizationId: string,
    @Body() body: LeaveDateAvailabilityDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.dateAvailability(context, body.from, body.to));
  }
  constructor(
    private readonly leave: LeaveService,
    private readonly contexts: DomainContextFactory,
    private readonly calendarService: LeaveCalendarService,
    private readonly attachments: LeaveAttachmentsService,
  ) {}
  @Post('requests/:requestId/attachments/:fileId/download') downloadAttachment(
    @Param('organizationId') organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attachments.download(context, requestId, fileId));
  }

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
        status: query.status,
        search: query.search,
        departmentId: query.departmentId,
        from: query.from,
        to: query.to,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
  }

  @Get('requests/summary') requestSummary(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.adminSummary(context));
  }

  /** Who is off between two dates, among the people the caller works with. */
  @Get('calendar') calendar(
    @Param('organizationId') organizationId: string,
    @Query() query: LeaveCalendarQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.calendarService.calendar(context, query.from, query.to));
  }

  /** Requests awaiting the signed-in user's decision. */
  @Get('requests/inbox') requestInbox(
    @Param('organizationId') organizationId: string,
    @Query() query: ApprovalInboxQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.listPendingApprovals(context, request.user.userId, query));
  }

  @Get('balances/page') balancePage(
    @Param('organizationId') organizationId: string,
    @Query() query: LeaveBalanceQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.listBalancePage(context, query));
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
    @Body() body: NativeLeaveTypeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.createType(context, body));
  }
  @Patch('types/:typeId') updateType(
    @Param('organizationId') organizationId: string,
    @Param('typeId', ParseUUIDPipe) typeId: string,
    @Body() body: NativeLeaveTypeUpdateDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.updateType(context, typeId, body));
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
    @Body() body: NativeLeaveRequestDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.createRequest(context, { ...body, source: 'NATIVE' }));
  }
  @Post('requests/preview') preview(
    @Param('organizationId') organizationId: string,
    @Body() body: NativeLeaveRequestDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.leave.previewRequest(context, body));
  }
  @Post('requests/:requestId/decision') decision(
    @Param('organizationId') organizationId: string,
    @Param('requestId') requestId: string,
    @Body() body: NativeLeaveDecisionDto,
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
