import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import {
  IsCalendarDate,
  IsNumberBetween,
  IsText,
  daysFromToday,
} from '../../common/validation/field-rules';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { LeaveCompOffService } from './leave-comp-off.service';
import { LeaveEncashmentService } from './leave-encashment.service';

export class CompOffRequestDto {
  // A day already worked: from the last three months up to today, in every timezone.
  @IsCalendarDate('Day worked', { earliest: daysFromToday(-92), latest: daysFromToday(1) })
  workDate!: string;
  @IsIn([0.5, 1], { message: 'Choose a full day or half a day.' }) days!: number;
  @IsText('Reason', LIMITS.reason, 3) reason!: string;
}

export class EncashmentRequestDto {
  @IsUUID() leaveTypeId!: string;
  @IsNumberBetween('Days to encash', 0.5, 366) days!: number;
}

export class ExtraDecisionDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

type Authed = Request & { user: NativeRequestUser };

/** Comp-off and encashment: the caller's own, and those waiting on them to decide. */
@Controller('v1/organizations/:organizationId/leave')
@UseGuards(NativeJwtGuard)
export class LeaveExtrasController {
  constructor(
    private readonly compOffs: LeaveCompOffService,
    private readonly encashments: LeaveEncashmentService,
    private readonly contexts: DomainContextFactory,
  ) {}

  private context(request: Authed, organizationId: string) {
    return this.contexts.native(request.user.userId, organizationId);
  }

  @Get('comp-offs') listCompOffs(@Param('organizationId') org: string, @Req() request: Authed) {
    return this.context(request, org).then((context) => this.compOffs.listCompOffs(context));
  }

  @Post('comp-offs') requestCompOff(
    @Param('organizationId') org: string,
    @Body() body: CompOffRequestDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.compOffs.requestCompOff(context, body),
    );
  }

  @Post('comp-offs/:id/decision') decideCompOff(
    @Param('organizationId') org: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExtraDecisionDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.compOffs.decideCompOff(context, id, body),
    );
  }

  @Get('encashments') listEncashments(
    @Param('organizationId') org: string,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) => this.encashments.listEncashments(context));
  }

  @Post('encashments') requestEncashment(
    @Param('organizationId') org: string,
    @Body() body: EncashmentRequestDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.encashments.requestEncashment(context, body),
    );
  }

  @Post('encashments/:id/decision') decideEncashment(
    @Param('organizationId') org: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExtraDecisionDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.encashments.decideEncashment(context, id, body),
    );
  }
}
