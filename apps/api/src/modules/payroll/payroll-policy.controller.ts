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
  PayrollRuleUpdateDecisionDto,
  PayrollRuleUpdateDto,
  SalaryProfilePreviewDto,
  SalaryAdvanceDecisionDto,
  SalaryAdvanceDto,
  SalaryProfileDto,
  StatutoryRuleDto,
} from './payroll.dto';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPreviewService } from './payroll-preview.service';
import { PayrollRuleUpdatesService } from './payroll-rule-updates.service';

@Controller('v1/organizations/:organizationId/payroll')
@UseGuards(NativeJwtGuard)
export class PayrollPolicyController {
  constructor(
    private readonly payroll: PayrollPolicyService,
    private readonly previewService: PayrollPreviewService,
    private readonly contexts: DomainContextFactory,
    private readonly ruleUpdates: PayrollRuleUpdatesService,
  ) {}

  @Get('rule-updates') ruleUpdatesList(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.ruleUpdates.list(context));
  }

  @Post('rule-updates/sync') syncRuleSources(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(
        request.user.userId,
        organizationId,
        undefined,
        'Manually check official payroll rule sources',
      )
      .then((context) => this.ruleUpdates.requestSync(context));
  }

  @Get('rule-updates/sync/:jobId') ruleSyncStatus(
    @Param('organizationId') organizationId: string,
    @Param('jobId') jobId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.ruleUpdates.syncStatus(context, jobId));
  }

  @Put('rule-updates/:proposalId') prepareRuleUpdate(
    @Param('organizationId') organizationId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: PayrollRuleUpdateDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(
        request.user.userId,
        organizationId,
        undefined,
        'Prepare verified payroll rule update',
      )
      .then((context) => this.ruleUpdates.prepareProposal(context, proposalId, body));
  }

  @Post('rule-updates/:proposalId/accept') acceptRuleUpdate(
    @Param('organizationId') organizationId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: PayrollRuleUpdateDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, 'Accept verified payroll rule update')
      .then((context) => this.ruleUpdates.accept(context, proposalId, body.note));
  }

  @Post('rule-updates/:proposalId/reject') rejectRuleUpdate(
    @Param('organizationId') organizationId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: PayrollRuleUpdateDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, 'Reject payroll rule update proposal')
      .then((context) => this.ruleUpdates.reject(context, proposalId, body.note));
  }

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

  @Get('policies') policies(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.listPolicies(context));
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

  @Put('statutory-rules/:ruleId') updateStatutoryRule(
    @Param('organizationId') organizationId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: StatutoryRuleDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, `Update statutory rule ${ruleId}`)
      .then((context) => this.payroll.saveStatutoryRule(context, body, ruleId));
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

  /** The salary profile worked out for a salary not yet saved. Reads only; writes nothing. */
  @Post('profile/preview') previewProfile(
    @Param('organizationId') organizationId: string,
    @Body() body: SalaryProfilePreviewDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    const { employeeId, ...whatIf } = body;
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.getSalaryProfile(context, employeeId, whatIf));
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
