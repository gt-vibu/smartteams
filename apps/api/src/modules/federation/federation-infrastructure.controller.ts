import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '../../common/health/health.service';
import { ConflictError } from '../../common/errors/domain-error';
import { OrganizationsService } from '../organizations/organizations.service';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationAuthService } from './federation-auth.service';
import { FederationControllerSupport } from './federation-controller-support';
import {
  FederationTokenDto,
  ProvisionBranchDto,
  ProvisionTenantDto,
  WebhookSubscriptionDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationGrantService } from './federation-grant.service';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { WebhookService } from './webhook.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationInfrastructureController {
  constructor(
    private readonly auth: FederationAuthService,
    private readonly grants: FederationGrantService,
    private readonly support: FederationControllerSupport,
    private readonly organizations: OrganizationsService,
    private readonly webhooks: WebhookService,
    private readonly health: HealthService,
  ) {}

  @Post('oauth/token')
  issueToken(
    @Body() body: FederationTokenDto,
    @Headers('x-client-certificate-fingerprint') mtlsFingerprint?: string,
  ) {
    return this.auth.issueToken({
      clientId: body.client_id,
      clientSecret: body.client_secret,
      mtlsFingerprint,
    });
  }

  @Get('federation/health/ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.readiness();
    if (result.status !== 'ok') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { ...result, signingAlgorithm: 'RSA-SHA256' };
  }

  @Get('federation/capabilities')
  @UseGuards(FederationAuthGuard)
  async capabilities(
    @Req() request: FederationRequest,
    @Headers('x-organization-id') organizationId?: string,
  ) {
    const federation = this.support.requireFederation(request);
    const target = organizationId
      ? await this.support.target(request, organizationId, undefined, 'capabilities.read')
      : undefined;
    const result = target
      ? await this.grants.listCapabilities(federation.clientInternalId, target.organizationId)
      : { capabilities: [], grantableCapabilities: [] };
    return {
      clientId: federation.clientId,
      organizationId: target?.organizationId ?? organizationId,
      capabilities: result.capabilities.map(({ capability, status }) => ({
        ...capability,
        status,
      })),
      grantableCapabilities: result.grantableCapabilities,
    };
  }

  @Put('federation/tenants/:organizationId')
  @UseGuards(FederationAuthGuard)
  async tenant(
    @Param('organizationId') organizationId: string,
    @Body() body: ProvisionTenantDto,
    @Req() request: FederationRequest,
  ) {
    const federation = this.support.requireFederation(request);
    return this.organizations.bootstrapFederated(federation.clientInternalId, organizationId, body);
  }

  @Put('federation/tenants/:organizationId/branches/:branchId')
  @UseGuards(FederationAuthGuard)
  async branch(
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
    @Body() body: ProvisionBranchDto,
    @Req() request: FederationRequest,
  ) {
    // The branch PUT is the registration operation, so the branch cannot be
    // resolved before the service creates it. An organization-wide grant is
    // still required; branch-scoped grants cannot create new branches.
    const target = await this.support.target(request, organizationId, undefined, 'branches.write');
    return this.organizations.syncFederatedBranch(
      await this.support.context(request, target.organizationId, 'branches.write'),
      organizationId,
      branchId,
      body,
    );
  }

  @Get('federation/webhook-signing-keys')
  @UseGuards(FederationAuthGuard)
  signingKeys() {
    return this.webhooks.signingKeys();
  }

  @Post('federation/webhook-subscriptions')
  @UseGuards(FederationAuthGuard)
  async subscribe(@Body() body: WebhookSubscriptionDto, @Req() request: FederationRequest) {
    const federation = this.support.requireFederation(request);
    const context = await this.support.context(request, body.organizationId, 'webhooks.write');
    return this.webhooks.subscribe(context, federation.clientInternalId, body);
  }

  @Get('federation/events')
  @UseGuards(FederationAuthGuard)
  async events(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-replay-cursor') cursor: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.webhooks.replay(
      await this.support.context(request, organizationId, 'events.read'),
      cursor,
    );
  }

  @Post('federation/webhook-deliveries/:deliveryId/replay')
  @UseGuards(FederationAuthGuard)
  async replayDelivery(
    @Param('deliveryId') deliveryId: string,
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(request, organizationId, 'webhooks.replay');
    if (!context.organizationId) throw new ConflictError('Federation organization is required');
    return this.webhooks.replayDelivery(context, deliveryId);
  }
}
