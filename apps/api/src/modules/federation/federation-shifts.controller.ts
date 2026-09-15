import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ShiftAssignmentDto,
  ShiftDeactivationDto,
  ShiftDto,
  UpdateShiftDto,
} from '../shifts/shifts.dto';
import { ShiftsService } from '../shifts/shifts.service';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { FederatedEmployeeService } from './federated-employee.service';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly employees: FederatedEmployeeService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/shifts')
  @UseGuards(FederationAuthGuard)
  async list(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.shifts.list(
      await this.support.context(request, organizationId, 'shifts.read', branchId),
    );
  }

  @Post('federation/shifts')
  @UseGuards(FederationAuthGuard)
  async create(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: ShiftDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'shifts.write',
      body.branchId,
    );
    return this.shifts.create(context, { ...body, branchId: context.branchId });
  }

  @Patch('federation/shifts/:shiftId')
  @UseGuards(FederationAuthGuard)
  async update(
    @Param('shiftId') shiftId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: UpdateShiftDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'shifts.write',
      body.branchId,
    );
    return this.shifts.update(context, shiftId, { ...body, branchId: context.branchId });
  }

  @Post('federation/shifts/:shiftId/deactivate')
  @UseGuards(FederationAuthGuard)
  async deactivate(
    @Param('shiftId') shiftId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: ShiftDeactivationDto,
    @Req() request: FederationRequest,
  ) {
    return this.shifts.deactivate(
      await this.support.context(request, organizationId, 'shifts.write', undefined, body.reason),
      shiftId,
      body.reason,
    );
  }

  @Post('federation/shifts/employees/:externalEmployeeId/assignments')
  @UseGuards(FederationAuthGuard)
  async assign(
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: ShiftAssignmentDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'shifts.write',
      body.branchId,
    );
    const employeeId = await this.employees.internalId(context, externalEmployeeId);
    return this.shifts.assign(context, employeeId, { ...body, branchId: context.branchId });
  }
}
