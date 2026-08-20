import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  BranchAssignmentDto,
  CompensationDto,
  CreateEmployeeDto,
  EmergencyContactDto,
  EmployeeDeactivationDto,
  EmploymentRecordDto,
  ManagerAssignmentDto,
  UpdateEmployeeDto,
} from './employees.dto';
import { ConflictError } from '../../common/errors/domain-error';
import { EmployeesService } from './employees.service';

@Controller('v1/organizations/:organizationId/employees')
@UseGuards(NativeJwtGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.list(context));
  }
  @Get(':employeeId') get(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.get(context, employeeId));
  }
  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateEmployeeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.createNative(context, body));
  }
  @Patch(':employeeId') update(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: UpdateEmployeeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    const version = Number(request.headers['if-match-version'] ?? 1);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new ConflictError('if-match-version must be a positive integer');
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.updateNative(context, employeeId, version, body));
  }
  @Post(':employeeId/branches') assignBranch(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: BranchAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.assignBranch(context, employeeId, body));
  }
  @Post(':employeeId/deactivate') deactivate(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: EmployeeDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.employees.deactivate(context, employeeId, body.reason));
  }
  @Get(':employeeId/emergency-contacts') contacts(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.listEmergencyContacts(context, employeeId));
  }
  @Post(':employeeId/emergency-contacts') addContact(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: EmergencyContactDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addEmergencyContact(context, employeeId, body));
  }
  @Post(':employeeId/employment-records') employment(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: EmploymentRecordDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addEmploymentRecord(context, employeeId, body));
  }
  @Post(':employeeId/compensation') compensation(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: CompensationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addCompensation(context, employeeId, body));
  }
  @Put(':employeeId/manager') manager(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: ManagerAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.assignManager(context, employeeId, body.managerEmployeeId));
  }
}
