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
import type { Request } from 'express';
import {
  IsEnum,
  IsBoolean,
  IsBooleanString,
  IsNumberString,
  IsOptional,
  Matches,
} from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';

export class NotificationQueryDto {
  @IsOptional() @IsBooleanString() unread?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

export class NotificationPreferencesDto {
  @IsBoolean() email!: boolean;
  @IsOptional() @IsEnum(['IMMEDIATE', 'DAILY_DIGEST']) delivery?: 'IMMEDIATE' | 'DAILY_DIGEST';
}

export class NotificationModuleDto {
  /** A screen's id, as notifications name it: 'approvals', 'time-off', … */
  @Matches(/^[a-z][a-z-]{0,39}$/) module!: string;
}

type Authed = Request & { user: NativeRequestUser };

/** The caller's own notifications. No permission beyond belonging to the organization. */
@Controller('v1/organizations/:organizationId/notifications')
@UseGuards(NativeJwtGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: NotificationQueryDto,
    @Req() request: Authed,
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.notifications.list(context, {
        unreadOnly: query.unread === 'true',
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );
  }

  @Get('preferences') preferences(
    @Param('organizationId') organizationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.notifications.preferences(context));
  }

  @Put('preferences') setPreferences(
    @Param('organizationId') organizationId: string,
    @Body() body: NotificationPreferencesDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.notifications.setPreferences(context, body));
  }

  @Post('read-all') readAll(
    @Param('organizationId') organizationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.notifications.markAllRead(context));
  }

  @Post('read-module') readModule(
    @Param('organizationId') organizationId: string,
    @Body() body: NotificationModuleDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.notifications.markModuleRead(context, body.module));
  }

  @Post(':notificationId/read') read(
    @Param('organizationId') organizationId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.notifications.markRead(context, notificationId));
  }
}
