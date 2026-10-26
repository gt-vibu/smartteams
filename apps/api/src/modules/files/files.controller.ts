import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { FileDeleteDto, FileQueryDto, FileUploadDto } from './files.dto';
import { FilesService } from './files.service';
import { FilesDocumentsService } from './files-documents.service';

@Controller('v1/organizations/:organizationId/files')
@UseGuards(NativeJwtGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly contexts: DomainContextFactory,
    private readonly documents: FilesDocumentsService,
  ) {}
  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: FileQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return (
      this.contexts
        .native(request.user.userId, organizationId)
        // Through the documents policy, in the shape this route always returned. The old listing let
        // `files.read.all` see every file, including employees' private ones.
        .then((context) => this.documents.list(context, 'all', query.employeeId))
        .then((documents) =>
          documents
            .filter((document) => !query.purpose || document.purpose === query.purpose)
            .slice(0, Math.min(query.limit ?? 100, 200))
            .map((document) => ({
              id: document.id,
              employeeId: document.employee?.id ?? null,
              purpose: document.purpose,
              status: 'AVAILABLE',
              originalName: document.name,
              contentType: document.contentType,
              byteSize: document.byteSize,
              createdAt: document.uploadedAt,
            })),
        )
    );
  }
  @Post('uploads') begin(
    @Param('organizationId') organizationId: string,
    @Body() body: FileUploadDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.files.beginUpload(context, body));
  }
  @Post(':fileId/complete') complete(
    @Param('organizationId') organizationId: string,
    @Param('fileId') fileId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.files.completeUpload(context, fileId));
  }
  @Post(':fileId/download') download(
    @Param('organizationId') organizationId: string,
    @Param('fileId') fileId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.documents.download(context, fileId));
  }
  @Post(':fileId/delete') delete(
    @Param('organizationId') organizationId: string,
    @Param('fileId') fileId: string,
    @Body() body: FileDeleteDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.documents.remove(context, fileId, body.reason));
  }
}
