import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { FileDeleteDto, FileQueryDto, FileUploadDto } from './files.dto';
import { FilesService } from './files.service';

@Controller('v1/organizations/:organizationId/files')
@UseGuards(NativeJwtGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: FileQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.files.list(context, query));
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
      .then((context) => this.files.download(context, fileId));
  }
  @Post(':fileId/delete') delete(
    @Param('organizationId') organizationId: string,
    @Param('fileId') fileId: string,
    @Body() body: FileDeleteDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.files.softDelete(context, fileId, body.reason));
  }
}
