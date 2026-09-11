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
import { ComplianceService } from '../compliance/compliance.service';
import {
  ComplianceQueryDto,
  StatutoryProfileDto,
  StatutoryRecordWriteDto,
} from '../compliance/compliance.dto';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { FederatedEmployeeService } from './federated-employee.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly employees: FederatedEmployeeService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/payroll/compliance/schemes')
  @UseGuards(FederationAuthGuard)
  async schemes(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.compliance.schemes(
      await this.support.context(request, organizationId, 'payroll.compliance.read'),
    );
  }

  @Get('federation/payroll/compliance/profiles/:externalEmployeeId')
  @UseGuards(FederationAuthGuard)
  async profiles(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.compliance.read',
      branchId,
    );
    return this.compliance.profiles(
      context,
      await this.employees.internalId(context, externalEmployeeId),
    );
  }

  @Post('federation/payroll/compliance/profiles/:externalEmployeeId')
  @UseGuards(FederationAuthGuard)
  async upsertProfile(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Body() body: StatutoryProfileDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.compliance.write',
      branchId,
    );
    return this.compliance.upsertProfile(
      context,
      await this.employees.internalId(context, externalEmployeeId),
      body,
    );
  }

  @Get('federation/payroll/compliance/records')
  @UseGuards(FederationAuthGuard)
  async records(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: ComplianceQueryDto,
    @Query('employeeId') externalEmployeeId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.compliance.read',
      branchId,
    );
    const employeeId = externalEmployeeId
      ? await this.employees.internalId(context, externalEmployeeId)
      : undefined;
    return this.compliance.records(context, employeeId, query);
  }

  @Post('federation/payroll/compliance/records/:externalEmployeeId')
  @UseGuards(FederationAuthGuard)
  async upsertRecord(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Body() body: StatutoryRecordWriteDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.compliance.write',
      branchId,
      body.reason,
    );
    return this.compliance.upsertRecord(
      context,
      await this.employees.internalId(context, externalEmployeeId),
      body,
      body.reason,
    );
  }
}
