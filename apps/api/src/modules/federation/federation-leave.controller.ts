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
import { LeaveService } from '../leave/leave.service';
import { LeaveDecisionDto, LeaveRequestDto, LeaveTypeDto } from '../leave/leave.dto';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import {
  FederatedLeaveAdjustmentDto,
  FederatedLeaveBalanceQueryDto,
  FederationReasonDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationLeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/leave/types')
  @UseGuards(FederationAuthGuard)
  async types(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.leave.listTypes(
      await this.support.context(request, organizationId, 'leave.types.read'),
    );
  }

  @Put('federation/leave/types/:code')
  @UseGuards(FederationAuthGuard)
  async type(
    @Param('code') code: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: LeaveTypeDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.syncType(
      await this.support.context(request, organizationId, 'leave.types.write'),
      code,
      body,
    );
  }

  @Get('federation/leave/balances')
  @UseGuards(FederationAuthGuard)
  async balances(
    @Headers('x-organization-id') organizationId: string,
    @Query() query: FederatedLeaveBalanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.listBalances(
      await this.support.context(request, organizationId, 'leave.balances.read'),
      query.employeeId,
    );
  }

  @Get('federation/leave/requests')
  @UseGuards(FederationAuthGuard)
  async requests(
    @Headers('x-organization-id') organizationId: string,
    @Query() query: FederatedLeaveBalanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.listRequests(
      await this.support.context(request, organizationId, 'leave.requests.read'),
      query.employeeId,
    );
  }

  @Post('federation/leave/requests')
  @UseGuards(FederationAuthGuard)
  async createRequest(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: LeaveRequestDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.createRequest(
      await this.support.context(request, organizationId, 'leave.requests.write', body.branchId),
      { ...body, source: 'FEDERATION' },
    );
  }

  @Post('federation/leave/requests/:requestId/decision')
  @UseGuards(FederationAuthGuard)
  async decision(
    @Param('requestId') requestId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: LeaveDecisionDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.decide(
      await this.support.context(
        request,
        organizationId,
        'leave.requests.decide',
        undefined,
        body.comment,
      ),
      requestId,
      body.status,
      body.comment,
    );
  }

  @Post('federation/leave/requests/:requestId/cancel')
  @UseGuards(FederationAuthGuard)
  async cancel(
    @Param('requestId') requestId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.cancel(
      await this.support.context(
        request,
        organizationId,
        'leave.requests.write',
        undefined,
        body.reason,
      ),
      requestId,
      body.reason,
    );
  }

  @Post('federation/leave/balances/adjustments')
  @UseGuards(FederationAuthGuard)
  async adjustment(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedLeaveAdjustmentDto,
    @Req() request: FederationRequest,
  ) {
    return this.leave.adjustBalance(
      await this.support.context(
        request,
        organizationId,
        'leave.balances.adjust',
        undefined,
        body.reason,
      ),
      body,
    );
  }
}
