import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsCalendarDate, yearsFromToday } from '../../common/validation/field-rules';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { EmployeeResignationsService } from './employee-resignations.service';

export class ResignationDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  // The service refuses a day in the past, in its own words; this holds it to a real date.
  @IsCalendarDate('Last working day', { latest: yearsFromToday(1) })
  requestedLastDay!: string;
}

export class ResignationDecisionDto {
  @IsBoolean() accept!: boolean;
  @IsOptional()
  @IsCalendarDate('Last working day', { earliest: yearsFromToday(-1), latest: yearsFromToday(1) })
  lastWorkingDay?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

type Authed = Request & { user: NativeRequestUser };

@Controller('v1/organizations/:organizationId/resignations')
@UseGuards(NativeJwtGuard)
export class EmployeeResignationsController {
  constructor(
    private readonly resignations: EmployeeResignationsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  /** Everyone's, for those who manage employees. */
  @Get() list(@Param('organizationId') organizationId: string, @Req() request: Authed) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.resignations.list(context));
  }

  /** The caller's own. */
  @Get('mine') mine(@Param('organizationId') organizationId: string, @Req() request: Authed) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.resignations.mine(context));
  }

  @Post() submit(
    @Param('organizationId') organizationId: string,
    @Body() body: ResignationDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.resignations.submit(context, body));
  }

  @Post(':resignationId/withdraw') withdraw(
    @Param('organizationId') organizationId: string,
    @Param('resignationId', ParseUUIDPipe) resignationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.resignations.withdraw(context, resignationId));
  }

  @Post(':resignationId/decision') decide(
    @Param('organizationId') organizationId: string,
    @Param('resignationId', ParseUUIDPipe) resignationId: string,
    @Body() body: ResignationDecisionDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.resignations.decide(context, resignationId, body));
  }
}
