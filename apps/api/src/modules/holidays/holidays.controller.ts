import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  HolidayDeactivationDto,
  HolidayDto,
  HolidayQueryDto,
  UpdateHolidayDto,
} from './holidays.dto';
import { HolidaysService } from './holidays.service';

/**
 * Native holiday management.
 *
 * The organization id in the path is not authority: `DomainContextFactory.native` resolves the
 * caller's membership and permissions for it, exactly as every other tenant route does, so a
 * caller cannot reach another tenant's holidays by changing the path.
 */
@Controller('v1/organizations/:organizationId/holidays')
@UseGuards(NativeJwtGuard)
export class HolidaysController {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: HolidayQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.list(context, query));
  }

  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: HolidayDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.create(context, body));
  }

  @Patch(':holidayId') update(
    @Param('organizationId') organizationId: string,
    @Param('holidayId') holidayId: string,
    @Body() body: UpdateHolidayDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.holidays.update(context, holidayId, body));
  }

  @Post(':holidayId/deactivate') deactivate(
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
