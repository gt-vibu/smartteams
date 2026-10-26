import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunReviewService } from './payroll-run-review.service';

export class StatutoryQueryDto {
  @IsIn(['EPF', 'ESIC', 'PT']) scheme!: 'EPF' | 'ESIC' | 'PT';
}

export class AnnualQueryDto {
  /** The year the financial year starts in: 2026 is April 2026 to March 2027. */
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year!: number;
}

type Authed = Request & { user: NativeRequestUser };

@Controller('v1/organizations/:organizationId/payroll')
@UseGuards(NativeJwtGuard)
export class PayrollReportsController {
  constructor(
    private readonly reports: PayrollReportsService,
    private readonly runReview: PayrollRunReviewService,
    private readonly contexts: DomainContextFactory,
  ) {}

  /** A calculated run's per-person figures, for reviewing it before approval. */
  @Get('runs/:runId/review') review(
    @Param('organizationId') organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.runReview.review(context, runId));
  }

  @Get('runs/:runId/statutory') statutory(
    @Param('organizationId') organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() query: StatutoryQueryDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.reports.statutory(context, runId, query.scheme));
  }

  @Get('runs/:runId/bank-file') bankFile(
    @Param('organizationId') organizationId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.reports.bankFile(context, runId));
  }

  @Get('employees/:employeeId/annual-statement') annual(
    @Param('organizationId') organizationId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: AnnualQueryDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.reports.annualStatement(context, employeeId, query.year));
  }
}
