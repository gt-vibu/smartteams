import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PayrollService } from '../payroll/payroll.service';
import { PayrollPolicyService } from '../payroll/payroll-policy.service';
import { PayrollPreviewService } from '../payroll/payroll-preview.service';
import {
  PayrollActionDto,
  PayrollAdjustmentDto,
  PayrollCalendarDto,
  PayrollRunDto,
  FederatedPayComponentAssignmentDto,
  PayrollPayslipQueryDto,
  PayrollLedgerQueryDto,
  PayComponentDto,
  FederatedEmployeePayrollPolicyDto,
  FederatedPayrollPreviewDto,
  FederatedSalaryAdvanceDto,
  FederatedSalaryProfileDto,
  PayrollPaymentDto,
  PayrollPolicyDto,
  SalaryAdvanceDecisionDto,
  StatutoryRuleDto,
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
    private readonly payrollPolicy: PayrollPolicyService,
    private readonly payrollPreview: PayrollPreviewService,
    private readonly support: FederationControllerSupport,
    private readonly employees: FederatedEmployeeService,
  ) {}

  @Get('federation/payroll/policy')
  @UseGuards(FederationAuthGuard)
  async policy(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.getPolicy(
      await this.support.context(request, organizationId, 'payroll.policy.read'),
    );
  }

  @Put('federation/payroll/policy')
  @UseGuards(FederationAuthGuard)
  async savePolicy(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayrollPolicyDto,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.savePolicy(
      await this.support.context(request, organizationId, 'payroll.policy.write'),
      body,
    );
  }

  @Get('federation/payroll/statutory-rules')
  @UseGuards(FederationAuthGuard)
  async statutoryRules(
    @Headers('x-organization-id') organizationId: string,
    @Query('jurisdiction') jurisdiction: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.listStatutoryRules(
      await this.support.context(request, organizationId, 'payroll.policy.read'),
      jurisdiction,
    );
  }

  @Post('federation/payroll/statutory-rules')
  @UseGuards(FederationAuthGuard)
  async saveStatutoryRule(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: StatutoryRuleDto,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.saveStatutoryRule(
      await this.support.context(
        request,
        organizationId,
        'payroll.policy.write',
        undefined,
        `Configure statutory rule ${body.schemeCode}`,
      ),
      body,
    );
  }

  @Delete('federation/payroll/statutory-rules/:ruleId')
  @UseGuards(FederationAuthGuard)
  async deleteStatutoryRule(
    @Headers('x-organization-id') organizationId: string,
    @Param('ruleId') ruleId: string,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.deleteStatutoryRule(
      await this.support.context(request, organizationId, 'payroll.policy.write'),
      ruleId,
    );
  }

  @Get('federation/payroll/profile')
  @UseGuards(FederationAuthGuard)
  async profile(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('employeeId') externalEmployeeId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.employee-profile.read',
      branchId,
    );
    return this.payrollPolicy.getSalaryProfile(
      context,
      externalEmployeeId ? await this.employees.internalId(context, externalEmployeeId) : undefined,
    );
  }

  @Put('federation/payroll/employee-policy')
  @UseGuards(FederationAuthGuard)
  async employeePolicy(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: FederatedEmployeePayrollPolicyDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.employee-profile.write',
      branchId,
    );
    return this.payrollPolicy.saveEmployeePolicy(context, {
      ...body,
      employeeId: await this.employees.internalId(context, body.externalEmployeeId),
    });
  }

  @Post('federation/payroll/profile')
  @UseGuards(FederationAuthGuard)
  async saveProfile(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: FederatedSalaryProfileDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.employee-profile.write',
      branchId,
    );
    return this.payrollPolicy.saveSalaryProfile(context, {
      ...body,
      employeeId: await this.employees.internalId(context, body.externalEmployeeId),
    });
  }

  @Post('federation/payroll/preview')
  @UseGuards(FederationAuthGuard)
  async preview(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: FederatedPayrollPreviewDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.preview.read',
      branchId,
    );
    return this.payrollPreview.preview(context, {
      ...body,
      employeeId: await this.employees.internalId(context, body.externalEmployeeId),
    });
  }

  @Get('federation/payroll/advances')
  @UseGuards(FederationAuthGuard)
  async advances(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('employeeId') externalEmployeeId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.advances.read',
      branchId,
    );
    return this.payrollPolicy.listAdvances(
      context,
      externalEmployeeId ? await this.employees.internalId(context, externalEmployeeId) : undefined,
    );
  }

  @Post('federation/payroll/advances')
  @UseGuards(FederationAuthGuard)
  async requestAdvance(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() body: FederatedSalaryAdvanceDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.advances.request',
      branchId,
      body.reason,
    );
    return this.payrollPolicy.requestAdvance(context, {
      employeeId: await this.employees.internalId(context, body.externalEmployeeId),
      amount: body.requestedAmount,
      reason: body.reason,
      externalId: body.externalId,
    });
  }

  @Post('federation/payroll/advances/:advanceId/decision')
  @UseGuards(FederationAuthGuard)
  async decideAdvance(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('advanceId') advanceId: string,
    @Body() body: SalaryAdvanceDecisionDto,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.decideAdvance(
      await this.support.context(
        request,
        organizationId,
        'payroll.advances.approve',
        branchId,
        body.comment,
      ),
      advanceId,
      body,
    );
  }

  @Get('federation/payroll/payments')
  @UseGuards(FederationAuthGuard)
  async payments(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query('employeeId') externalEmployeeId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'payroll.payments.read',
      branchId,
    );
    return this.payrollPolicy.listPayments(
      context,
      externalEmployeeId ? await this.employees.internalId(context, externalEmployeeId) : undefined,
    );
  }

  @Post('federation/payroll/payments/:lineItemId/paid')
  @UseGuards(FederationAuthGuard)
  async markPaid(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('lineItemId') lineItemId: string,
    @Body() body: PayrollPaymentDto,
    @Req() request: FederationRequest,
  ) {
    return this.payrollPolicy.markPaymentPaid(
      await this.support.context(
        request,
        organizationId,
        'payroll.payments.write',
        branchId,
        body.paymentReference ?? 'Mark payroll payment paid',
      ),
      lineItemId,
      body,
    );
  }

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

  @Post('federation/payroll/components')
  @UseGuards(FederationAuthGuard)
  async createComponent(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayComponentDto,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.createComponent(
      await this.support.context(
        request,
        organizationId,
        'payroll.components.write',
        undefined,
        body.name,
      ),
      body,
    );
  }

  @Patch('federation/payroll/components/:componentId')
  @UseGuards(FederationAuthGuard)
  async updateComponent(
    @Param('componentId') componentId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PayComponentDto,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.updateComponent(
      await this.support.context(
        request,
        organizationId,
        'payroll.components.write',
        undefined,
        body.name,
      ),
      componentId,
      body,
    );
  }

  @Get('federation/payroll/calendars')
  @UseGuards(FederationAuthGuard)
  async calendar(
    @Headers('x-organization-id') organizationId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.payroll.getCalendar(
      await this.support.context(request, organizationId, 'payroll.calendars.read'),
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
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
      {
        year: calendar.year,
        month: calendar.month,
        ...body,
      },
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
