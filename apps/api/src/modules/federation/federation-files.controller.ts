import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilePurpose } from '../../generated/prisma/enums';
import { FilesService } from '../files/files.service';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import { FederatedEmployeeService } from './federated-employee.service';
import {
  FederatedEmployeeDocumentUploadDto,
  FederatedLeaveAttachmentUploadDto,
  FederationReasonDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationFilesController {
  constructor(
    private readonly files: FilesService,
    private readonly employees: FederatedEmployeeService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/employees/:externalEmployeeId/documents')
  @UseGuards(FederationAuthGuard)
  async listEmployeeDocuments(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'employees.documents.read',
      branchId,
    );
    const employeeId = await this.employees.internalId(context, externalEmployeeId);
    return { items: await this.files.listEmployeeDocuments(context, employeeId) };
  }

  @Post('federation/employees/:externalEmployeeId/documents')
  @UseGuards(FederationAuthGuard)
  async beginEmployeeDocument(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Body() body: FederatedEmployeeDocumentUploadDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'employees.documents.write',
      branchId,
    );
    const upload = await this.files.beginUpload(context, {
      ...body,
      purpose:
        body.documentType === 'PROFILE_PICTURE'
          ? FilePurpose.PROFILE_IMAGE
          : FilePurpose.EMPLOYEE_DOCUMENT,
      employeeId: await this.employees.internalId(context, externalEmployeeId),
    });
    return {
      fileId: upload.fileId,
      uploadUrl: upload.uploadUrl,
      uploadHeaders: upload.uploadHeaders,
      expiresIn: upload.expiresIn,
    };
  }

  @Post('federation/employees/:externalEmployeeId/documents/:fileId/complete')
  @UseGuards(FederationAuthGuard)
  async completeEmployeeDocument(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Param('fileId') fileId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'employees.documents.write',
      branchId,
    );
    return this.files.completeUpload(
      context,
      fileId,
      await this.employees.internalId(context, externalEmployeeId),
      [FilePurpose.EMPLOYEE_DOCUMENT, FilePurpose.PROFILE_IMAGE],
    );
  }

  @Post('federation/employees/:externalEmployeeId/documents/:fileId/download')
  @UseGuards(FederationAuthGuard)
  async downloadEmployeeDocument(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Param('fileId') fileId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'employees.documents.read',
      branchId,
    );
    return this.files.download(
      context,
      fileId,
      await this.employees.internalId(context, externalEmployeeId),
      [FilePurpose.EMPLOYEE_DOCUMENT, FilePurpose.PROFILE_IMAGE],
    );
  }

  @Post('federation/employees/:externalEmployeeId/documents/:fileId/delete')
  @UseGuards(FederationAuthGuard)
  async deleteEmployeeDocument(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Param('fileId') fileId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'employees.documents.write',
      branchId,
      body.reason,
    );
    return this.files.softDelete(
      context,
      fileId,
      body.reason,
      await this.employees.internalId(context, externalEmployeeId),
      [FilePurpose.EMPLOYEE_DOCUMENT, FilePurpose.PROFILE_IMAGE],
    );
  }

  @Post('federation/files/leave-attachments')
  @UseGuards(FederationAuthGuard)
  async beginLeaveAttachment(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-employee-id') externalEmployeeId: string,
    @Body() body: FederatedLeaveAttachmentUploadDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(request, organizationId, 'files.write');
    return this.files.beginUpload(context, {
      ...body,
      purpose: FilePurpose.LEAVE_ATTACHMENT,
      employeeId: await this.employees.internalId(context, externalEmployeeId),
    });
  }

  @Post('federation/files/:fileId/complete')
  @UseGuards(FederationAuthGuard)
  async complete(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-employee-id') externalEmployeeId: string,
    @Param('fileId') fileId: string,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(request, organizationId, 'files.write');
    return this.files.completeUpload(
      context,
      fileId,
      await this.employees.internalId(context, externalEmployeeId),
    );
  }

  @Post('federation/files/:fileId/delete')
  @UseGuards(FederationAuthGuard)
  async delete(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-employee-id') externalEmployeeId: string,
    @Param('fileId') fileId: string,
    @Body() body: FederationReasonDto,
    @Req() request: FederationRequest,
  ) {
    const context = await this.support.context(
      request,
      organizationId,
      'files.write',
      undefined,
      body.reason,
    );
    return this.files.softDelete(
      context,
      fileId,
      body.reason,
      await this.employees.internalId(context, externalEmployeeId),
      FilePurpose.LEAVE_ATTACHMENT,
    );
  }
}
