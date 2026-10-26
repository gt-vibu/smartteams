import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { AttendanceWorkWeekService } from './attendance-work-week.service';

export class WorkWeekDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workWeekDays!: number[];

  @IsOptional() @IsBoolean() unmarkedDaysAreAbsent?: boolean;
}

/** The organization's working days. Native only: federation partners do not see this route. */
@Controller('v1/organizations/:organizationId/attendance/work-week')
@UseGuards(NativeJwtGuard)
export class AttendanceWorkWeekController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly workWeek: AttendanceWorkWeekService,
  ) {}

  @Get() read(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.workWeek.get(context));
  }

  @Put() update(
    @Param('organizationId') organizationId: string,
    @Body() body: WorkWeekDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.workWeek.update(context, body.workWeekDays, body.unmarkedDaysAreAbsent),
      );
  }
}
