import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsDateString, IsInt, Max, Min } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { AttendanceLateService } from './attendance-late.service';

export class LateRulesDto {
  @IsInt() @Min(0) @Max(240) graceMinutes!: number;
  /** 0 means late marks never cost pay. */
  @IsInt() @Min(0) @Max(31) marksPerHalfDay!: number;
}

export class LateQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

type Authed = Request & { user: NativeRequestUser };

@Controller('v1/organizations/:organizationId/attendance/late')
@UseGuards(NativeJwtGuard)
export class AttendanceLateController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly late: AttendanceLateService,
  ) {}

  /** Late check-ins between two dates: the caller's own, or everyone's for attendance managers. */
  @Get() marks(
    @Param('organizationId') organizationId: string,
    @Query() query: LateQueryDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.late.marks(context, query.from, query.to));
  }

  @Get('rules') rules(@Param('organizationId') organizationId: string, @Req() request: Authed) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.late.rules(context));
  }

  @Put('rules') setRules(
    @Param('organizationId') organizationId: string,
    @Body() body: LateRulesDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.late.setRules(context, body));
  }
}
