import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { LeaveWorkflowsService } from './leave-workflows.service';
class SettingsDto {
  @IsEnum(['IMMEDIATE', 'REVIEW', 'DISABLED']) futureCancellation!:
    'IMMEDIATE' | 'REVIEW' | 'DISABLED';
  @IsInt() @Min(0) @Max(365) minimumNoticeDays!: number;
  @IsEnum(['REVIEW', 'DISABLED']) startedCancellation!: 'REVIEW' | 'DISABLED';
}
class DecisionDto {
  @IsEnum(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
class InboxDto {
  @IsOptional() @IsUUID() cursor?: string;
}
type Authed = Request & { user: NativeRequestUser };
@Controller('v1/organizations/:organizationId/leave/workflows')
@UseGuards(NativeJwtGuard)
export class LeaveWorkflowsController {
  constructor(
    private readonly workflows: LeaveWorkflowsService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get('settings') settings(@Param('organizationId') org: string, @Req() req: Authed) {
    return this.contexts.native(req.user.userId, org).then((ctx) => this.workflows.settings(ctx));
  }
  @Put('settings') save(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Body() body: SettingsDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((ctx) => this.workflows.saveSettings(ctx, body));
  }
  @Get('cancellations') inbox(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Query() query: InboxDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((ctx) => this.workflows.inbox(ctx, query.cursor));
  }
  @Post('cancellations/:id/decision') decide(
    @Param('organizationId') org: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Authed,
    @Body() body: DecisionDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((ctx) => this.workflows.decideCancellation(ctx, id, body.status, body.reason));
  }
}
