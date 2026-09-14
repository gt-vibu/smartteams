import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  EmployeePayrollPolicyDto,
  PayrollListQueryDto,
  PayrollPaymentDto,
  PayrollPolicyDto,
  PayrollPreviewDto,
  SalaryAdvanceDecisionDto,
  SalaryAdvanceDto,
  SalaryProfileDto,
  StatutoryRuleDto,
} from './payroll.dto';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPreviewService } from './payroll-preview.service';

@Controller('v1/organizations/:organizationId/payroll')
@UseGuards(NativeJwtGuard)
export class PayrollPolicyController {
  constructor(
    private readonly payroll: PayrollPolicyService,
    private readonly previewService: PayrollPreviewService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get('policy') policy(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.getPolicy(context));
  }

  @Put('policy') savePolicy(
    @Param('organizationId') organizationId: string,
    @Body() body: PayrollPolicyDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.savePolicy(context, body));
  }

  @Get('statutory-rules') statutoryRules(
    @Param('organizationId') organizationId: string,
    @Query('jurisdiction') jurisdiction: string | undefined,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.listStatutoryRules(context, jurisdiction));
  }

  @Post('statutory-rules') saveStatutoryRule(
    @Param('organizationId') organizationId: string,
    @Body() body: StatutoryRuleDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(
        request.user.userId,
        organizationId,
        undefined,
        `Configure statutory rule ${body.schemeCode}`,
      )
      .then((context) => this.payroll.saveStatutoryRule(context, body));
  }

  @Delete('statutory-rules/:ruleId') deleteStatutoryRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, `Remove statutory rule ${ruleId}`)
      .then((context) => this.payroll.deleteStatutoryRule(context, ruleId));
  }

  @Put('employee-policy') saveEmployeePolicy(
    @Param('organizationId') organizationId: string,
    @Body() body: EmployeePayrollPolicyDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.saveEmployeePolicy(context, body));
  }

  @Get('profile') profile(
    @Param('organizationId') organizationId: string,
    @Query('employeeId') employeeId: string | undefined,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.getSalaryProfile(context, employeeId));
  }

  @Post('profile') saveProfile(
    @Param('organizationId') organizationId: string,
    @Body() body: SalaryProfileDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.saveSalaryProfile(context, body));
  }

  @Post('preview') preview(
    @Param('organizationId') organizationId: string,
    @Body() body: PayrollPreviewDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.previewService.preview(context, body));
  }

  @Get('advances') advances(
    @Param('organizationId') organizationId: string,
    @Query() query: PayrollListQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    // Paged: `{ items, nextCursor }`. Federation's route of the same name is not.
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.payroll.listAdvances(context, query.employeeId, {
        limit: query.limit,
        cursor: query.cursor,
      }),
    );
  }

  @Post('advances') requestAdvance(
    @Param('organizationId') organizationId: string,
    @Body() body: SalaryAdvanceDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) =>
        this.payroll.requestAdvance(context, {
          employeeId: body.employeeId,
          amount: body.requestedAmount,
          reason: body.reason,
          externalId: body.externalId,
        }),
      );
  }

  @Post('advances/:advanceId/decision') decideAdvance(
    @Param('organizationId') organizationId: string,
    @Param('advanceId') advanceId: string,
    @Body() body: SalaryAdvanceDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.comment)
      .then((context) => this.payroll.decideAdvance(context, advanceId, body));
  }

  @Get('payments') payments(
    @Param('organizationId') organizationId: string,
    @Query() query: PayrollListQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    // Paged: `{ items, nextCursor }`. Federation's route of the same name is not.
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.payroll.listPayments(context, query.employeeId, {
        limit: query.limit,
        cursor: query.cursor,
      }),
    );
  }

  @Post('payments/:lineItemId/paid') markPaid(
    @Param('organizationId') organizationId: string,
    @Param('lineItemId') lineItemId: string,
    @Body() body: PayrollPaymentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(
        request.user.userId,
        organizationId,
        undefined,
        body.paymentReference ?? 'Mark payroll payment paid',
      )
      .then((context) => this.payroll.markPaymentPaid(context, lineItemId, body));
  }
}
