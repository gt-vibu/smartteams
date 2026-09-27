import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { LeaveCompOffService } from './leave-comp-off.service';
import { LeaveEncashmentService } from './leave-encashment.service';

export class CompOffRequestDto {
  @IsDateString() workDate!: string;
  @IsIn([0.5, 1]) days!: number;
  @IsString() @MaxLength(500) reason!: string;
}

export class EncashmentRequestDto {
  @IsUUID() leaveTypeId!: string;
  @IsNumber() @Min(0.5) days!: number;
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
