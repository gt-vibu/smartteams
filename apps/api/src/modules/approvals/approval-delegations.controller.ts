import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ApprovalDelegationsService } from './approval-delegations.service';

export class ApprovalDelegationDto {
  @IsUUID() delegateEmployeeId!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

type Authed = Request & { user: NativeRequestUser };

/** The caller's own handovers. No permission beyond belonging to the organization. */
@Controller('v1/organizations/:organizationId/approval-delegations')
@UseGuards(NativeJwtGuard)
export class ApprovalDelegationsController {
  constructor(
    private readonly delegations: ApprovalDelegationsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get() list(@Param('organizationId') organizationId: string, @Req() request: Authed) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.delegations.list(context));
  }

  @Get('candidates') candidates(
    @Param('organizationId') organizationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.delegations.candidates(context));
  }

  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: ApprovalDelegationDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.delegations.create(context, body));
  }

  @Post(':delegationId/revoke') revoke(
    @Param('organizationId') organizationId: string,
    @Param('delegationId', ParseUUIDPipe) delegationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.delegations.revoke(context, delegationId));
  }
}
