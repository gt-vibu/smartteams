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
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { DocumentQueryDto, DocumentUploadDto, FileShareDto } from './files.dto';
import { FilesDocumentsService } from './files-documents.service';
import { FilesSharesService } from './files-shares.service';

type AuthedRequest = Request & { user: NativeRequestUser };

/**
 * The website's document routes: scoped listing, view, download and sharing.
 *
 * Registered ahead of `FilesController` so `documents/...` is never read as a file id.
 * Federation partners do not reach these routes; theirs are unchanged.
 */
@Controller('v1/organizations/:organizationId/files')
@UseGuards(NativeJwtGuard)
export class FilesDocumentsController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly documents: FilesDocumentsService,
    private readonly shares: FilesSharesService,
  ) {}

  @Get('documents') list(
    @Param('organizationId') organizationId: string,
    @Query() query: DocumentQueryDto,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.documents.list(context, query.section ?? 'all', query.employeeId));
  }

  @Post('documents/uploads') begin(
    @Param('organizationId') organizationId: string,
    @Body() body: DocumentUploadDto,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.documents.beginUpload(context, body));
  }

  @Post(':fileId/view') view(
    @Param('organizationId') organizationId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.documents.view(context, fileId));
  }

  @Get(':fileId/shares') listShares(
    @Param('organizationId') organizationId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shares.list(context, fileId));
  }

  @Post(':fileId/shares') share(
    @Param('organizationId') organizationId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() body: FileShareDto,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shares.create(context, fileId, body));
  }

  @Post(':fileId/shares/:shareId/revoke') revoke(
    @Param('organizationId') organizationId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.shares.revoke(context, fileId, shareId));
  }
}
