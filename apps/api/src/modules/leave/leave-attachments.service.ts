import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { canApprove } from '../approvals/approval-authorization';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LeaveAttachmentsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async download(context: DomainContext, requestId: string, fileId: string) {
    requirePermission(context, 'leave.requests.read');
    const file = await this.database.run(context, async (tx) => {
      const request = await tx.leaveRequest.findFirst({
        where: { id: requestId, organizationId: context.organizationId },
        include: {
          employee: { include: { manager: { select: { userId: true } } } },
          approvals: true,
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        },
      });
      if (!request) throw new NotFoundError('Leave attachment');
      let allowed =
        context.permissions.has('*') ||
        context.permissions.has('leave.requests.read.all') ||
        request.employee.userId === context.actor.userId;
      const step =
        request.status === 'PENDING'
          ? request.approvalPolicy?.steps.find(
              (item) =>
                !request.approvals.some((decision) => decision.stepNumber === item.stepNumber),
            )
          : undefined;
      if (
        !allowed &&
        step &&
        context.actor.userId &&
        context.permissions.has('leave.requests.decide')
      )
        allowed = await canApprove(
          tx,
          context.organizationId,
          context.actor.userId,
          request.employee.manager?.userId,
          step.approverType,
          step.roleId,
          step.approverUserId,
          request.branchId ?? undefined,
          request.employee.userId,
        );
      if (!allowed) throw new NotFoundError('Leave attachment');
      const found = await tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          leaveRequestId: request.id,
          employeeId: request.employeeId,
          purpose: 'LEAVE_ATTACHMENT',
          status: 'AVAILABLE',
          deletedAt: null,
        },
      });
      if (!found) throw new NotFoundError('Leave attachment');
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: found.id,
          action: 'LEAVE_ATTACHMENT_DOWNLOADED',
          afterState: { leaveRequestId: request.id },
        },
        tx,
      );
      return found;
    });
    return {
      fileId: file.id,
      downloadUrl: await this.storage.createDownloadUrl(file.objectKey, {
        fileName: file.originalName,
        contentType: file.contentType,
      }),
    };
  }
}
