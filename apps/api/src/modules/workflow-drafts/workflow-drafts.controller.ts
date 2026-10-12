import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { ListWorkflowDraftsDto, SaveWorkflowDraftDto } from './workflow-drafts.dto';
import { WorkflowDraftsService } from './workflow-drafts.service';

@Controller('v1/organizations/:organizationId/workflow-drafts')
@UseGuards(NativeJwtGuard)
export class WorkflowDraftsController {
  constructor(
    private readonly drafts: WorkflowDraftsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: ListWorkflowDraftsDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.drafts.list(context, query.kind));
  }

  @Post()
  save(
    @Param('organizationId') organizationId: string,
    @Body() body: SaveWorkflowDraftDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.drafts.save(context, body));
  }

  @Delete(':draftId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('draftId') draftId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.drafts.remove(context, draftId));
  }
}
