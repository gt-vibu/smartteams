import { ApproverSearchDto, ApproverSearchService } from './approver-search.service';
import { ApprovalExistingAutomationService } from './approval-existing-automation.service';
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ApprovalAutomationPreviewService } from './approval-automation-preview.service';
import { ApprovalFollowUpService } from './approval-follow-up.service';
import {
  ApprovalPolicyDeactivationDto,
  ApprovalPolicyDto,
  AutomationPreviewDto,
  ExistingAutomationDto,
  UpdateApprovalPolicyDto,
} from './approvals.dto';
import { ApprovalsService } from './approvals.service';

export class ApprovalFollowUpDto {
  /** 0 turns reminders off. */
  @IsInt() @Min(0) @Max(30) reminderDays!: number;
  /** 0 turns escalation off. */
  @IsInt() @Min(0) @Max(60) escalationDays!: number;
}

@Controller('v1/organizations/:organizationId/approval-policies')
@UseGuards(NativeJwtGuard)
export class ApprovalsController {
  constructor(
    private readonly approverSearch: ApproverSearchService,
    private readonly approvals: ApprovalsService,
    private readonly contexts: DomainContextFactory,
    private readonly followUp: ApprovalFollowUpService,
    private readonly existingAutomation: ApprovalExistingAutomationService,
    private readonly automationPreview: ApprovalAutomationPreviewService,
  ) {}
  @Post('automation-preview') previewAutomation(
    @Param('organizationId') organizationId: string,
    @Body() body: AutomationPreviewDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.automationPreview.preview(context, body));
  }
  @Post('automation-apply-existing') applyExisting(
    @Param('organizationId') organizationId: string,
    @Body() body: ExistingAutomationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.existingAutomation.apply(context, body));
  }
  @Get('follow-up') getFollowUp(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.followUp.get(context));
  }
  @Put('follow-up') setFollowUp(
    @Param('organizationId') organizationId: string,
    @Body() body: ApprovalFollowUpDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.followUp.set(context, body));
  }
  /** Who can be named on an approval step: active employees with a login. */
  @Get('approver-search') searchApprovers(@Param('organizationId') organizationId: string, @Query() query: ApproverSearchDto, @Req() request: Request & { user: NativeRequestUser }) { return this.contexts.native(request.user.userId, organizationId).then(context => this.approverSearch.search(context, query)); }
  @Get('approver-candidates') approverCandidates(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.approvals.approverCandidates(context));
  }
  @Get() list(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.approvals.list(context));
  }
  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: ApprovalPolicyDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.approvals.create(context, body));
  }
  @Patch(':policyId') update(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @Body() body: UpdateApprovalPolicyDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.approvals.update(context, policyId, body));
  }
  @Post(':policyId/deactivate') deactivate(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @Body() body: ApprovalPolicyDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.approvals.deactivate(context, policyId, body.reason));
  }
}
