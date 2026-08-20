import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { parseWebauthnResponse, WebauthnService } from '../attendance/webauthn.service';
import { EmployeesService } from '../employees/employees.service';
import { ConflictError } from '../../common/errors/domain-error';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import {
  FederatedAccessDto,
  FederatedBranchAssignmentDto,
  FederatedEmployeeDto,
  FederatedWebauthnCompleteDto,
  FederationDeviceLabelDto,
  FederationReasonDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationEmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly webauthn: WebauthnService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Put('federation/employees/:externalId')
  @UseGuards(FederationAuthGuard)
  async employee(
    @Param('externalId') externalId: string,
    @Body() body: FederatedEmployeeDto,
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    if (body.externalId !== undefined && body.externalId !== externalId)
      throw new ConflictError('Employee path externalId must match the request body externalId');
    const context = await this.support.context(request, organizationId, 'employees.write');
    return this.employees.syncFederated(
      context,
      externalId,
      this.support.requireFederation(request).clientInternalId,
      body,
    );
  }

  @Put('federation/employees/:externalId/branches/:branchId')
  @UseGuards(FederationAuthGuard)
  async employeeBranch(
    @Param('externalId') employeeId: string,
    @Param('branchId') branchId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedBranchAssignmentDto,
    @Req() request: FederationRequest,
  ) {
    return this.employees.assignFederatedBranch(
      await this.support.context(request, organizationId, 'employees.branches.write', branchId),
      employeeId,
      branchId,
      body,
    );
  }

  @Put('federation/employees/:externalId/access')
  @UseGuards(FederationAuthGuard)
  async employeeAccess(
    @Param('externalId') employeeId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedAccessDto,
    @Req() request: FederationRequest,
  ) {
    return this.employees.syncAccess(
      await this.support.context(request, organizationId, 'employees.access.write'),
      employeeId,
      body.permissionKeys,
    );
  }

  @Post('federation/employees/:externalId/sessions/revoke')
  @UseGuards(FederationAuthGuard)
  async employeeSessions(
    @Param('externalId') employeeId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    return this.employees.revokeFederatedSessions(
      await this.support.context(
        request,
        organizationId,
        'employees.sessions.revoke',
        undefined,
        body.reason,
      ),
      employeeId,
      body.reason,
    );
  }

  @Post('federation/employees/:employeeId/webauthn/enrollments/begin')
  @UseGuards(FederationAuthGuard)
  async enrollmentBegin(
    @Param('employeeId') employeeId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederationDeviceLabelDto,
    @Req() request: FederationRequest,
  ) {
    return this.webauthn.beginEnrollment(
      await this.support.context(request, organizationId, 'attendance.webauthn.enroll'),
      employeeId,
      body.deviceLabel,
    );
  }

  @Post('federation/employees/:employeeId/webauthn/enrollments/complete')
  @UseGuards(FederationAuthGuard)
  async enrollmentComplete(
    @Param('employeeId') employeeId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedWebauthnCompleteDto,
    @Req() request: FederationRequest,
  ) {
    return this.webauthn.completeEnrollment(
      await this.support.context(request, organizationId, 'attendance.webauthn.enroll'),
      employeeId,
      body.challengeId,
      parseWebauthnResponse(body.response),
      body.deviceLabel,
    );
  }
}
