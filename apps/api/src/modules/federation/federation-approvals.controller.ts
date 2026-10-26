import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import {
  FederatedApprovalPolicyDto,
  FederatedApprovalPolicyPatchDto,
  FederatedApprovalRoleQueryDto,
} from './federation-approvals.dto';
import { FederationReasonDto } from './federation.dto';
import { FederationApprovalsService } from './federation-approvals.service';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationApprovalsController {
  constructor(
    private readonly approvals: FederationApprovalsService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/approval-policies')
  @UseGuards(FederationAuthGuard)
  async list(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.approvals.list(
      await this.support.context(request, organizationId, 'approval-policies.read'),
    );
  }

  @Get('federation/approval-roles')
  @UseGuards(FederationAuthGuard)
  async roles(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: FederatedApprovalRoleQueryDto,
    @Req() request: FederationRequest,
  ) {
    return this.approvals.listApproverRoles(
      await this.support.context(request, organizationId, 'approval-policies.read', branchId),
      query.domain,
    );
  }

  @Post('federation/approval-policies')
  @UseGuards(FederationAuthGuard)
  create(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedApprovalPolicyDto,
    @Req() request: FederationRequest,
  ) {
    return this.support
      .context(request, organizationId, 'approval-policies.write', undefined, body.name)
      .then((context) => this.approvals.create(context, body));
  }

  @Patch('federation/approval-policies/:policyId')
  @UseGuards(FederationAuthGuard)
  update(
    @Headers('x-organization-id') organizationId: string,
    @Param('policyId') policyId: string,
    @Body() body: FederatedApprovalPolicyPatchDto,
    @Req() request: FederationRequest,
  ) {
    return this.support
      .context(request, organizationId, 'approval-policies.write', undefined, body.name)
      .then((context) => this.approvals.update(context, policyId, body));
  }

  @Post('federation/approval-policies/:policyId/deactivate')
  @UseGuards(FederationAuthGuard)
  deactivate(
    @Headers('x-organization-id') organizationId: string,
    @Param('policyId') policyId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    return this.support
      .context(request, organizationId, 'approval-policies.write', undefined, body.reason)
      .then((context) => this.approvals.deactivate(context, policyId, body.reason));
  }

  @Post('federation/approval-policies/:policyId/reactivate')
  @UseGuards(FederationAuthGuard)
  reactivate(
    @Headers('x-organization-id') organizationId: string,
    @Param('policyId') policyId: string,
    @Req() request: FederationRequest,
  ) {
    return this.support
      .context(request, organizationId, 'approval-policies.write')
      .then((context) => this.approvals.reactivate(context, policyId));
  }
}
