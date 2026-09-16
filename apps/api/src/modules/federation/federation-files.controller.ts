import {
  Body,
  Controller,
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
import { FederatedLeaveAttachmentUploadDto, FederationReasonDto } from './federation.dto';
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
