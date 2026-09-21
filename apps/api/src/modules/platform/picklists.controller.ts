import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsString, MaxLength } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NotFoundError } from '../../common/errors/domain-error';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { isPicklistKind, PicklistsService, type PicklistKind } from './picklists.service';

class PicklistEntryDto {
  @IsString() @MaxLength(80) name!: string;
}

class PicklistRenameDto extends PicklistEntryDto {
  @IsString() @MaxLength(80) to!: string;
}

function kindOf(value: string): PicklistKind {
  if (!isPicklistKind(value)) throw new NotFoundError('List');
  return value;
}

type Authed = Request & { user: NativeRequestUser };

/** The organization's reference lists: `project-roles`, `job-titles`, `team-roles`. */
@Controller('v1/organizations/:organizationId/picklists/:kind')
@UseGuards(NativeJwtGuard)
export class PicklistsController {
  constructor(
    private readonly picklists: PicklistsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  private context(request: Authed, organizationId: string) {
    return this.contexts.native(request.user.userId, organizationId);
  }

  @Get() list(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) => this.picklists.list(c, kindOf(kind)));
  }

  @Post() add(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Body() body: PicklistEntryDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.picklists.add(c, kindOf(kind), body.name),
    );
  }

  @Post('rename') rename(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Body() body: PicklistRenameDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.picklists.rename(c, kindOf(kind), body.name, body.to),
    );
  }

  @Post('archive') archive(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Body() body: PicklistEntryDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.picklists.setArchived(c, kindOf(kind), body.name, true),
    );
  }

  @Post('restore') restore(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Body() body: PicklistEntryDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.picklists.setArchived(c, kindOf(kind), body.name, false),
    );
  }

  @Post('remove') remove(
    @Param('organizationId') organizationId: string,
    @Param('kind') kind: string,
    @Body() body: PicklistEntryDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.picklists.remove(c, kindOf(kind), body.name),
    );
  }
}
