import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { parseWebauthnResponse, WebauthnService } from '../attendance/webauthn.service';
import { EmployeesService } from '../employees/employees.service';
import {
  CompensationDto,
  EmergencyContactDto,
  EmploymentRecordDto,
  ManagerAssignmentDto,
} from '../employees/employees.dto';
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
  FederatedEmployeePatchDto,
  FederatedEmployeeQueryDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { FederatedEmployeeService } from './federated-employee.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationEmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly federatedEmployees: FederatedEmployeeService,
    private readonly webauthn: WebauthnService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/employees')
  @UseGuards(FederationAuthGuard)
  async list(
    @Headers('x-organization-id') organizationId: string,
    @Query() query: FederatedEmployeeQueryDto,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.list(
      await this.support.context(request, organizationId, 'employees.read', query.branchId),
      query,
    );
  }

  @Get('federation/employees/:externalId')
  @UseGuards(FederationAuthGuard)
  async get(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.get(
      await this.support.context(request, organizationId, 'employees.read', branchId),
      externalId,
    );
  }

  @Put('federation/employees/:externalId')
  @UseGuards(FederationAuthGuard)
  async employee(
    @Param('externalId') externalId: string,
    @Body() body: FederatedEmployeeDto,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    if (body.externalId !== undefined && body.externalId !== externalId)
      throw new ConflictError('Employee path externalId must match the request body externalId');
    const context = await this.support.context(
      request,
      organizationId,
      'employees.write',
      branchId,
    );
    return this.federatedEmployees.upsert(
      context,
      externalId,
      this.support.requireFederation(request).clientInternalId,
      body,
    );
  }

  @Patch('federation/employees/:externalId')
  @UseGuards(FederationAuthGuard)
  async patch(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedEmployeePatchDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.patch(
      await this.support.context(
        request,
        organizationId,
        'employees.write',
        branchId ?? body.primaryBranchId,
      ),
      externalId,
      this.support.requireFederation(request).clientInternalId,
      body,
    );
  }

  @Post('federation/employees/:externalId/deactivate')
  @UseGuards(FederationAuthGuard)
  async deactivate(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederationReasonDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.deactivate(
      await this.support.context(request, organizationId, 'employees.write', branchId, body.reason),
      externalId,
      body.reason,
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

  @Delete('federation/employees/:externalId/branches/:branchId')
  @UseGuards(FederationAuthGuard)
  async removeEmployeeBranch(
    @Param('externalId') employeeId: string,
    @Param('branchId') branchId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.removeBranch(
      await this.support.context(
        request,
        organizationId,
        'employees.branches.write',
        branchId,
        body.reason,
      ),
      employeeId,
      branchId,
      body.reason,
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

  @Get('federation/employees/:externalId/emergency-contacts')
  @UseGuards(FederationAuthGuard)
  async contacts(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.contacts(
      await this.support.context(request, organizationId, 'employees.read', branchId),
      externalId,
    );
  }

  @Post('federation/employees/:externalId/emergency-contacts')
  @UseGuards(FederationAuthGuard)
  async addContact(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: EmergencyContactDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.addContact(
      await this.support.context(request, organizationId, 'employees.write', branchId),
      externalId,
      body,
    );
  }

  @Get('federation/employees/:externalId/employment-records')
  @UseGuards(FederationAuthGuard)
  async employment(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.employment(
      await this.support.context(request, organizationId, 'employees.read', branchId),
      externalId,
    );
  }

  @Post('federation/employees/:externalId/employment-records')
  @UseGuards(FederationAuthGuard)
  async addEmployment(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: EmploymentRecordDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.addEmployment(
      await this.support.context(request, organizationId, 'employees.write', branchId),
      externalId,
      body,
    );
  }

  @Get('federation/employees/:externalId/compensation')
  @UseGuards(FederationAuthGuard)
  async compensation(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.compensation(
      await this.support.context(request, organizationId, 'employees.read', branchId),
      externalId,
    );
  }

  @Post('federation/employees/:externalId/compensation')
  @UseGuards(FederationAuthGuard)
  async addCompensation(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: CompensationDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.addCompensation(
      await this.support.context(request, organizationId, 'employees.compensation.write', branchId),
      externalId,
      body,
    );
  }

  @Put('federation/employees/:externalId/manager')
  @UseGuards(FederationAuthGuard)
  async manager(
    @Param('externalId') externalId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: ManagerAssignmentDto,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.federatedEmployees.assignManager(
      await this.support.context(request, organizationId, 'employees.write', branchId),
      externalId,
      body.managerEmployeeId,
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
