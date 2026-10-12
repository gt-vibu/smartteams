import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ApprovalBatchDto } from './approval-batches.dto';
import { ApprovalBatchesService } from './approval-batches.service';
class HistoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset?: number;
}

@Controller('v1/organizations/:organizationId/approval-batches')
@UseGuards(NativeJwtGuard)
export class ApprovalBatchesController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly batches: ApprovalBatchesService,
  ) {}
  @Get('history') history(
    @Param('organizationId') organizationId: string,
    @Query() query: HistoryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.batches.history(context, query.offset));
  }
  @Post() start(
    @Param('organizationId') organizationId: string,
    @Body() body: ApprovalBatchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.batches.start(context, body));
  }
  @Get(':batchId') get(
    @Param('organizationId') organizationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.batches.get(context, batchId));
  }
}
