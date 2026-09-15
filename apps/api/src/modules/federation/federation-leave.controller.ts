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
import {
  FederationControllerSupport,
  requireFederatedApprover,
} from './federation-controller-support';
import {
  FederatedLeaveAdjustmentDto,
  FederatedLeaveBalanceQueryDto,
  FederationReasonDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { FederatedEmployeeService } from './federated-employee.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationLeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly support: FederationControllerSupport,
    private readonly employees: FederatedEmployeeService,
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

  @Get('federation/leave/assignments')
  @UseGuards(FederationAuthGuard)
  async assignments(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.leave.listAssignments(
      await this.support.context(request, organizationId, 'leave.types.read', branchId),
    );
  }

  @Post('federation/leave/types/:code/assign')
  @UseGuards(FederationAuthGuard)
  async assignType(
    @Param('code') code: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.leave.assignTypeToBranch(
      await this.support.context(request, organizationId, 'leave.types.write', branchId),
      code,
    );
  }

  @Get('federation/leave/balances')
  @UseGuards(FederationAuthGuard)
  async balances(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: FederatedLeaveBalanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.balances.read',
      branchId,
    );
    const employeeId = query.employeeId
      ? await this.employees.internalId(context, query.employeeId)
      : undefined;
    return this.leave.listBalances(context, employeeId);
  }

  @Get('federation/leave/requests')
  @UseGuards(FederationAuthGuard)
  async requests(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: FederatedLeaveBalanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.requests.read',
      branchId,
    );
    const employeeId = query.employeeId
      ? await this.employees.internalId(context, query.employeeId)
      : undefined;
    return this.leave.listRequests(context, employeeId, {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Get('federation/leave/approvals/inbox')
  @UseGuards(FederationAuthGuard)
  async approvalInbox(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Query() query: FederatedLeaveBalanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.requests.read',
      branchId,
    );
    const approverUserId = await this.employees.internalUserId(
      context,
      requireFederatedApprover(query.employeeId),
    );
    return this.leave.listPendingApprovals(context, approverUserId);
  }

  @Post('federation/leave/requests')
  @UseGuards(FederationAuthGuard)
  async createRequest(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: LeaveRequestDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.requests.write',
      body.branchId,
    );
    const employeeId = await this.employees.internalId(context, body.employeeId);
    return this.leave.createRequest(context, {
      ...body,
      employeeId,
      ...(context.branchId ? { branchId: context.branchId } : {}),
      source: 'FEDERATION',
    });
  }

  @Post('federation/leave/requests/:requestId/decision')
  @UseGuards(FederationAuthGuard)
  async decision(
    @Param('requestId') requestId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: LeaveDecisionDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.requests.decide',
      branchId,
      body.comment,
    );
    const approverUserId = await this.employees.internalUserId(
      context,
      requireFederatedApprover(body.decidedByExternalEmployeeId),
    );
    return this.leave.decide(
      await this.support.context(
        request,
        organizationId,
        'leave.requests.decide',
        branchId,
        body.comment,
        approverUserId,
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
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.leave.cancel(
      await this.support.context(
        request,
        organizationId,
        'leave.requests.write',
        branchId,
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
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'leave.balances.adjust',
      branchId,
      body.reason,
    );
    return this.leave.adjustBalance(context, {
      ...body,
      employeeId: await this.employees.internalId(context, body.employeeId),
    });
  }
}
