import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ShiftAssignmentDto, ShiftDeactivationDto, ShiftDto, UpdateShiftDto } from './shifts.dto';
import { ShiftsService } from './shifts.service';

@Controller('v1/organizations/:organizationId/shifts')
@UseGuards(NativeJwtGuard)
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get() list(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shifts.list(context));
  }
  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: ShiftDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shifts.create(context, body));
  }
  @Patch(':shiftId') update(
    @Param('organizationId') organizationId: string,
    @Param('shiftId') shiftId: string,
    @Body() body: UpdateShiftDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shifts.update(context, shiftId, body));
  }
  @Post(':shiftId/deactivate') deactivate(
    @Param('organizationId') organizationId: string,
    @Param('shiftId') shiftId: string,
    @Body() body: ShiftDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.shifts.deactivate(context, shiftId, body.reason));
  }
  @Post('employees/:employeeId/assignments') assign(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: ShiftAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shifts.assign(context, employeeId, body));
  }
}
