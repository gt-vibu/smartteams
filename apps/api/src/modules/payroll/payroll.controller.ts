import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  PayComponentAssignmentDto,
  PayComponentDto,
  PayrollActionDto,
  PayrollAdjustmentDto,
  PayrollPayslipQueryDto,
  PayrollRunDto,
} from './payroll.dto';
import { PayrollService } from './payroll.service';
import { PayrollAdjustmentSource } from '../../generated/prisma/enums';

@Controller('v1/organizations/:organizationId/payroll')
@UseGuards(NativeJwtGuard)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get('components') components(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.listComponents(context));
  }
  @Get('runs') runs(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.listRuns(context));
  }
  @Get('payslips') payslips(
    @Param('organizationId') organizationId: string,
    @Query() query: PayrollPayslipQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.listPayslips(context, query.employeeId));
  }
  @Post('components') component(
    @Param('organizationId') organizationId: string,
    @Body() body: PayComponentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.createComponent(context, body));
  }
  @Post('components/assignments') assignment(
    @Param('organizationId') organizationId: string,
    @Body() body: PayComponentAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.assignComponent(context, body));
  }
  @Post('runs') run(
    @Param('organizationId') organizationId: string,
    @Body() body: PayrollRunDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.createRun(context, body));
  }
  @Post('runs/:runId/calculate') calculate(
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.calculate(context, runId));
  }
  @Post('runs/:runId/adjustments') adjustment(
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
    @Body() body: Omit<PayrollAdjustmentDto, 'payrollRunId'>,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.description)
      .then((context) =>
        this.payroll.addAdjustment(context, {
          ...body,
          payrollRunId: runId,
          source: PayrollAdjustmentSource.NATIVE,
        }),
      );
  }
  @Post('runs/:runId/action') action(
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
    @Body() body: PayrollActionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.comment)
      .then((context) => this.payroll.advance(context, runId, body.target, body.comment));
  }
}
