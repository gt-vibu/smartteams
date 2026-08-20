import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  ManualEntryDto,
  TimesheetDecisionDto,
  TimesheetPeriodDto,
  TimesheetQueryDto,
} from './timesheets.dto';
import { TimesheetsService } from './timesheets.service';

@Controller('v1/organizations/:organizationId/timesheets')
@UseGuards(NativeJwtGuard)
export class TimesheetsController {
  constructor(
    private readonly timesheets: TimesheetsService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: TimesheetQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.timesheets.list(context, query));
  }
  @Post('periods') period(
    @Param('organizationId') organizationId: string,
    @Body() body: TimesheetPeriodDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.timesheets.createPeriod(context, body));
  }
  @Post('periods/:periodId/derive') derive(
    @Param('organizationId') organizationId: string,
    @Param('periodId') periodId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.timesheets.derive(context, periodId));
  }
  @Post(':timesheetId/entries') entry(
    @Param('organizationId') organizationId: string,
    @Param('timesheetId') timesheetId: string,
    @Body() body: ManualEntryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.timesheets.addManualEntry(context, timesheetId, body));
  }
  @Post(':timesheetId/submit') submit(
    @Param('organizationId') organizationId: string,
    @Param('timesheetId') timesheetId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.timesheets.submit(context, timesheetId));
  }
  @Post(':timesheetId/decision') decision(
    @Param('organizationId') organizationId: string,
    @Param('timesheetId') timesheetId: string,
    @Body() body: TimesheetDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.comment)
      .then((context) => this.timesheets.decide(context, timesheetId, body.status, body.comment));
  }
}
