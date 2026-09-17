import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  CurrentShiftQueryDto,
  EndShiftAssignmentDto,
  ShiftAssignmentListQueryDto,
  ShiftAssignmentDto,
  ShiftDeactivationDto,
  ShiftDto,
  UpdateShiftDto,
} from './shifts.dto';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { ShiftsService } from './shifts.service';

@Controller('v1/organizations/:organizationId/shifts')
@UseGuards(NativeJwtGuard)
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly assignments: ShiftAssignmentsService,
    private readonly contexts: DomainContextFactory,
  ) {}
  /** The shift an employee is assigned to on a day — the caller's own unless they may read others. */
  @Get('assignments/current') current(
    @Param('organizationId') organizationId: string,
    @Query() query: CurrentShiftQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.assignments.current(context, query));
  }
  /** Who is on which shift; current and upcoming unless `includeEnded`. */
  @Get('assignments') assignmentList(
    @Param('organizationId') organizationId: string,
    @Query() query: ShiftAssignmentListQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.assignments.list(context, {
        ...(query.shiftId ? { shiftId: query.shiftId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.includeEnded ? { includeEnded: query.includeEnded === 'true' } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
  }
  @Post('assignments/:assignmentId/end') endAssignment(
    @Param('organizationId') organizationId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: EndShiftAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.assignments.end(context, assignmentId, body));
  }
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
