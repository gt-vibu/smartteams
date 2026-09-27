import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsDateString } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ReportsService } from './reports.service';

export class ReportSpanDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

type Authed = Request & { user: NativeRequestUser };

@Controller('v1/organizations/:organizationId/reports')
@UseGuards(NativeJwtGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get('headcount') headcount(@Param('organizationId') org: string, @Req() request: Authed) {
    return this.contexts
      .native(request.user.userId, org)
      .then((context) => this.reports.headcount(context));
  }

  @Get('attendance') attendance(
    @Param('organizationId') org: string,
    @Query() span: ReportSpanDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((context) => this.reports.attendance(context, span.from, span.to));
  }

  @Get('leave') leave(
    @Param('organizationId') org: string,
    @Query() span: ReportSpanDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((context) => this.reports.leave(context, span.from, span.to));
  }

  @Get('project-hours') projectHours(
    @Param('organizationId') org: string,
    @Query() span: ReportSpanDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((context) => this.reports.projectHours(context, span.from, span.to));
  }
}
