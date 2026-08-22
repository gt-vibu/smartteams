import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PayrollService } from '../payroll/payroll.service';
import {
  PayrollActionDto,
  PayrollAdjustmentDto,
  PayrollCalendarDto,
  PayrollRunDto,
  FederatedPayComponentAssignmentDto,
  PayrollPayslipQueryDto,
  PayrollLedgerQueryDto,
} from '../payroll/payroll.dto';
import { FederatedEmployeeService } from './federated-employee.service';
import { PayrollAdjustmentSource } from '../../generated/prisma/enums';
import type { PayrollRunStatus } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationPayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly support: FederationControllerSupport,
    private readonly employees: FederatedEmployeeService,
  ) {}

  @Get('federation/payroll/components')
  @UseGuards(FederationAuthGuard)
  async components(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.listComponents(
      await this.support.context(request, organizationId, 'payroll.components.read'),
    );
  }

  @Get('federation/payroll/calendars')
  @UseGuards(FederationAuthGuard)
  async calendar(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.getCalendar(
      await this.support.context(request, organizationId, 'payroll.calendars.read'),
    );
  }

  @Get('federation/payroll/runs')
  @UseGuards(FederationAuthGuard)
  async runs(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.listRuns(
      await this.support.context(request, organizationId, 'payroll.runs.read'),
    );
  }

  @Get('federation/payroll/payslips')
  @UseGuards(FederationAuthGuard)
  async payslips(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: PayrollPayslipQueryDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.payslips.read',
      branchId,
    );
    const employeeId = query.employeeId
      ? await this.employees.internalId(context, query.employeeId)
      : undefined;
    return this.payroll.listPayslips(context, employeeId);
  }

  @Get('federation/payroll/employee-components')
  @UseGuards(FederationAuthGuard)
  async employeeComponents(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('employeeId') externalEmployeeId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.components.read',
      branchId,
    );
    return this.payroll.listEmployeeComponents(
      context,
      await this.employees.internalId(context, externalEmployeeId),
    );
  }

  @Post('federation/payroll/employee-components')
  @UseGuards(FederationAuthGuard)
  async assignEmployeeComponent(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: FederatedPayComponentAssignmentDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.components.write',
      branchId,
    );
    return this.payroll.assignComponent(context, {
      ...body,
      employeeId: await this.employees.internalId(context, body.externalEmployeeId),
    });
  }

  @Post('federation/payroll/runs')
  @UseGuards(FederationAuthGuard)
  async createRun(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayrollRunDto,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.createRun(
      await this.support.context(request, organizationId, 'payroll.runs.write'),
      body,
    );
  }

  @Post('federation/payroll/runs/:runId/:action')
  @UseGuards(FederationAuthGuard)
  async action(
    @Param('runId') runId: string,
    @Param('action') action: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayrollActionDto,
    @Req() request: FederationRequest,
  ) {
    const target = action.toUpperCase();
    if (!isPayrollStatus(target)) throw new ConflictError('Unsupported payroll action');
    return this.payroll.advance(
      await this.support.context(
        request,
        organizationId,
        payrollScope(target),
        undefined,
        body.comment,
      ),
      runId,
      target,
      body.comment,
    );
  }

  @Post('federation/payroll/adjustments')
  @UseGuards(FederationAuthGuard)
  async adjustment(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: PayrollAdjustmentDto,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.addAdjustment(
      await this.support.context(
        request,
        organizationId,
        'payroll.adjustments.write',
        branchId,
        body.description,
      ),
      { ...body, source: PayrollAdjustmentSource.FEDERATION },
    );
  }

  @Get('federation/payroll/ledger')
  @UseGuards(FederationAuthGuard)
  async ledger(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: PayrollLedgerQueryDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.ledger.read',
      branchId,
    );
    const employeeId = query.employeeId
      ? await this.employees.internalId(context, query.employeeId)
      : undefined;
    return this.payroll.ledger(context, employeeId, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Put('federation/payroll/calendars/:year/:month')
  @UseGuards(FederationAuthGuard)
  async updateCalendar(
    @Param('year') year: string,
    @Param('month') month: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayrollCalendarDto,
    @Req() request: FederationRequest,
  ) {
    const calendar = parseCalendar(year, month);
    return this.payroll.updateCalendar(
      await this.support.context(request, organizationId, 'payroll.calendars.write'),
      body.payrollDayOfMonth,
      calendar,
    );
  }
}

function parseCalendar(year: string, month: string) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
    throw new ConflictError('Payroll calendar year is invalid');
  }
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
    throw new ConflictError('Payroll calendar month is invalid');
  }
  return { year: numericYear, month: numericMonth };
}

function isPayrollStatus(value: string): value is PayrollRunStatus {
  return (
    value === 'CALCULATED' || value === 'APPROVED' || value === 'RELEASED' || value === 'LOCKED'
  );
}

function payrollScope(target: PayrollRunStatus) {
  return target === 'CALCULATED'
    ? 'payroll.runs.calculate'
    : target === 'APPROVED'
      ? 'payroll.runs.approve'
      : target === 'RELEASED'
        ? 'payroll.runs.release'
        : 'payroll.runs.lock';
}
