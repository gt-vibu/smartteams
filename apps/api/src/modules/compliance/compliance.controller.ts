import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import type { NativeRequestUser } from '../auth/jwt.guard';
import { NativeJwtGuard } from '../auth/jwt.guard';
import { ComplianceQueryDto, StatutoryProfileDto, StatutoryRecordWriteDto } from './compliance.dto';
import { ComplianceService } from './compliance.service';

@Controller('v1/organizations/:organizationId/compliance')
@UseGuards(NativeJwtGuard)
export class ComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get('employees/:employeeId/profiles')
  profiles(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.compliance.profiles(context, employeeId));
  }

  @Post('employees/:employeeId/profiles')
  upsertProfile(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: StatutoryProfileDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.compliance.upsertProfile(context, employeeId, body));
  }

  @Get('records')
  records(
    @Param('organizationId') organizationId: string,
    @Query() query: ComplianceQueryDto,
    @Query('employeeId') employeeId: string | undefined,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.compliance.records(context, employeeId, query));
  }

  @Post('employees/:employeeId/records')
  upsertRecord(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: StatutoryRecordWriteDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.compliance.upsertRecord(context, employeeId, body, body.reason));
  }
}
