import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ReportsService } from './reports.service';

export class ReportSpanDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class ReportDateDto {
  @IsDateString() date!: string;
}

export class ReportExportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT', 'SUBMITTED']) status?: string;
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

  @Get('attendance-summary') attendanceSummary(
    @Param('organizationId') org: string,
    @Query() query: ReportDateDto,
    @Req() request: Authed,
  ) {
    return this.contexts.native(request.user.userId, org)
      .then((context) => this.reports.attendanceSummary(context, query.date));
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

  @Get('non-working-days') nonWorkingDays(
    @Param('organizationId') org: string,
    @Query() span: ReportSpanDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, org)
      .then((context) => this.reports.nonWorkingDaysAudit(context, span.from, span.to));
  }

  @Get('leave/export') exportLeave(
    @Param('organizationId') org: string,
    @Query() query: ReportExportQueryDto,
    @Req() request: Authed,
    @Res() response: Response,
  ) {
    return this.contexts.native(request.user.userId, org).then((context) =>
      this.reports.exportLeaveCsv(context, query, response),
    );
  }

  @Get('timesheets/export') exportTimesheets(
    @Param('organizationId') org: string,
    @Query() query: ReportExportQueryDto,
    @Req() request: Authed,
    @Res() response: Response,
  ) {
    return this.contexts.native(request.user.userId, org).then((context) =>
      this.reports.exportTimesheetsCsv(context, query, response),
    );
  }
}
