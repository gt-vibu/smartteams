import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ManualEntryDto,
  TimesheetDecisionDto,
  TimesheetPeriodDto,
} from '../timesheets/timesheets.dto';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { FederationAuthGuard } from './federation-auth.guard';
import {
  FederationControllerSupport,
  requireFederatedApprover,
} from './federation-controller-support';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { FederatedEmployeeService } from './federated-employee.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationTimesheetsController {
  constructor(
    private readonly timesheets: TimesheetsService,
    private readonly employees: FederatedEmployeeService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/timesheets')
  @UseGuards(FederationAuthGuard)
  async list(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('employeeId') externalEmployeeId: string | undefined,
    @Query('periodId') periodId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'timesheets.read',
      branchId,
    );
    const employeeId = externalEmployeeId
      ? await this.employees.internalId(context, externalEmployeeId)
      : undefined;
    return this.timesheets.list(context, { employeeId, periodId });
  }

  @Post('federation/timesheets/periods')
  @UseGuards(FederationAuthGuard)
  async period(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: TimesheetPeriodDto,
    @Req() request: FederationRequest,
  ) {
    return this.timesheets.createPeriod(
      await this.support.context(request, organizationId, 'timesheets.write', branchId),
      body,
    );
  }

  @Post('federation/timesheets/periods/:periodId/derive')
  @UseGuards(FederationAuthGuard)
  async derive(
    @Param('periodId') periodId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.timesheets.derive(
      await this.support.context(request, organizationId, 'timesheets.write', branchId),
      periodId,
    );
  }

  @Post('federation/timesheets/:timesheetId/entries')
  @UseGuards(FederationAuthGuard)
  async entry(
    @Param('timesheetId') timesheetId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: ManualEntryDto,
    @Req() request: FederationRequest,
  ) {
    return this.timesheets.addManualEntry(
      await this.support.context(request, organizationId, 'timesheets.write', branchId),
      timesheetId,
      body,
    );
  }

  @Post('federation/timesheets/:timesheetId/submit')
  @UseGuards(FederationAuthGuard)
  async submit(
    @Param('timesheetId') timesheetId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.timesheets.submit(
      await this.support.context(request, organizationId, 'timesheets.submit', branchId),
      timesheetId,
    );
  }

  @Post('federation/timesheets/:timesheetId/decision')
  @UseGuards(FederationAuthGuard)
  async decision(
    @Param('timesheetId') timesheetId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: TimesheetDecisionDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'timesheets.decide',
      branchId,
      body.comment,
    );
    const approverUserId = await this.employees.internalUserId(
      context,
      requireFederatedApprover(body.decidedByExternalEmployeeId),
    );
    return this.timesheets.decide(
      await this.support.context(
        request,
        organizationId,
        'timesheets.decide',
        branchId,
        body.comment,
        approverUserId,
      ),
      timesheetId,
      body.status,
      body.comment,
    );
  }
}
