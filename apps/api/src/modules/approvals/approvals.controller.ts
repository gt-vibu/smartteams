import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  ApprovalPolicyDeactivationDto,
  ApprovalPolicyDto,
  UpdateApprovalPolicyDto,
} from './approvals.dto';
import { ApprovalsService } from './approvals.service';

@Controller('v1/organizations/:organizationId/approval-policies')
@UseGuards(NativeJwtGuard)
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly contexts: DomainContextFactory,
  ) {}
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
