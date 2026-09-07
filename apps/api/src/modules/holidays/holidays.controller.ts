import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  CancelHolidaySelectionDto,
  EmployeeHolidayQueryDto,
  HolidayDeactivationDto,
  HolidayDto,
  HolidayQueryDto,
  HolidaySelectionsQueryDto,
  SelectHolidaysDto,
  UpdateHolidayDto,
  UpdateHolidaySettingsDto,
  UpsertEmployeeHolidayPolicyDto,
} from './holidays.dto';
import { EmployeeHolidaysService } from './employee-holidays.service';
import { HolidaysService } from './holidays.service';

/**
 * Holiday management & employee floating holiday selection.
 *
 * Scoped under `/v1/organizations/:organizationId/holidays`.
 * Context factory ensures multi-tenant isolation and loads authenticated user permissions.
 */
@Controller('v1/organizations/:organizationId/holidays')
@UseGuards(NativeJwtGuard)
export class HolidaysController {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly employeeHolidays: EmployeeHolidaysService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: HolidayQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.list(context, query));
  }

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: HolidayDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.create(context, body));
  }

  @Get('settings')
  getSettings(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.getSettings(context));
  }

  @Patch('settings')
  updateSettings(
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateHolidaySettingsDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.updateSettings(context, body));
  }

  @Get('my-summary')
  getMySummary(
    @Param('organizationId') organizationId: string,
    @Query() query: EmployeeHolidayQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employeeHolidays.getMyHolidaySummary(context, query.year));
  }

  @Post('select')
  select(
    @Param('organizationId') organizationId: string,
    @Body() body: SelectHolidaysDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employeeHolidays.selectHolidays(context, body.holidayIds));
  }

  @Post('cancel')
  cancel(
    @Param('organizationId') organizationId: string,
    @Body() body: CancelHolidaySelectionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.employeeHolidays.cancelSelection(context, body.holidayId, body.reason),
      );
  }

  @Get('selections')
  listSelections(
    @Param('organizationId') organizationId: string,
    @Query() query: HolidaySelectionsQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.listSelections(context, query));
  }

  // ─── Per-employee holiday policy endpoints ────────────────────────────────

  @Get('employee-policies')
  listEmployeePolicies(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.listEmployeePolicies(context));
  }

  @Get('employee-policies/:employeeId')
  getEmployeePolicy(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.getEmployeePolicy(context, employeeId));
  }

  @Put('employee-policies/:employeeId')
  upsertEmployeePolicy(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: UpsertEmployeeHolidayPolicyDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.upsertEmployeePolicy(context, employeeId, body));
  }

  @Delete('employee-policies/:employeeId')
  deleteEmployeePolicy(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.deleteEmployeePolicy(context, employeeId));
  }

  // ─── Holiday-specific CRUD ─────────────────────────────────────────────────

  @Patch(':holidayId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('holidayId') holidayId: string,
    @Body() body: UpdateHolidayDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.update(context, holidayId, body));
  }

  @Post(':holidayId/deactivate')
  deactivate(
    @Param('organizationId') organizationId: string,
    @Param('holidayId') holidayId: string,
    @Body() body: HolidayDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.holidays.deactivate(context, holidayId, body.reason));
  }
}
