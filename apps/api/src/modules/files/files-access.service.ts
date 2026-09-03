import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AccessMode, FilePurpose, FileStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import type { Queue } from 'bullmq';
import { toFileDto } from './files-shared';

@Injectable()
export class FilesAccessService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue('file-lifecycle') private readonly lifecycleQueue: Queue,
  ) {}

  async list(
    context: DomainContext,
    filters: { purpose?: FilePurpose; employeeId?: string; limit?: number } = {},
  ) {
    requirePermission(context, 'files.read');
    const canReadAll =
      context.accessMode === AccessMode.FEDERATION ||
      context.permissions.has('*') ||
      context.permissions.has('files.read.all');
    return this.database.run(context, async (tx) => {
      let employeeId = filters.employeeId;
      if (!canReadAll) {
        const employee = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!employee) return [];
        // A requested employee that is not the caller is narrowed to the caller rather than
        // refused, so the response never confirms whether that employee has files.
        employeeId = employee.id;
      }
      const files = await tx.fileObject.findMany({
        where: {
          organizationId: context.organizationId,
          status: FileStatus.AVAILABLE,
          deletedAt: null,
          ...(employeeId ? { employeeId } : {}),
          ...(filters.purpose ? { purpose: filters.purpose } : {}),
        },
        select: {
          id: true,
          employeeId: true,
          purpose: true,
          status: true,
          originalName: true,
          contentType: true,
          byteSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit ?? 100, 200),
      });
      return files.map(toFileDto);
    });
  }

  async download(context: DomainContext, fileId: string) {
    requirePermission(context, 'files.read');
    const canReadAll =
      context.accessMode === AccessMode.FEDERATION ||
      context.permissions.has('*') ||
      context.permissions.has('files.read.all');
    const file = await this.database.run(context, async (tx) => {
      const found = await tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          status: FileStatus.AVAILABLE,
          deletedAt: null,
        },
      });
      if (!found || canReadAll) return found;
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, userId: context.actor.userId },
        select: { id: true },
      });
      // Reported as missing rather than forbidden: a caller who may not read the file should not
      // learn that the id exists.
      if (!employee || found.employeeId !== employee.id) return null;
      return found;
    });
    if (!file) throw new NotFoundError('File');
    return {
      fileId: file.id,
      downloadUrl: await this.storage.createDownloadUrl(file.objectKey),
      expiresIn: 600,
    };
  }

  async softDelete(
    context: DomainContext,
    fileId: string,
    reason: string,
    employeeId?: string,
    purpose?: FilePurpose,
  ) {
    requirePermission(context, 'files.write');
    requireReason({ ...context, reason }, 'File deletion requires a reason');
    return this.database.run(context, async (tx) => {
      const file = await tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          status: { not: FileStatus.DELETED },
          ...(employeeId ? { employeeId } : {}),
          ...(purpose ? { purpose } : {}),
        },
      });
      if (!file) throw new NotFoundError('File');
      const updated = await tx.fileObject.update({
        where: { id: file.id },
        data: { status: FileStatus.DELETED, deletedAt: new Date() },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: file.id,
          action: 'FILE_SOFT_DELETED',
          beforeState: jsonSnapshot(file),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      await this.lifecycleQueue.add(
        'purge',
        { fileId: file.id, organizationId: context.organizationId },
        {
          delay: this.config.get<number>('FILE_DELETION_RETENTION_DAYS', 30) * 86_400_000,
          attempts: 5,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      return toFileDto(updated);
    });
  }

  async purgeDeleted(fileId: string, organizationId: string) {
    const file = await this.database.runSystem(organizationId, (tx) =>
      tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId,
          status: FileStatus.DELETED,
          deletedAt: {
            lte: new Date(
              Date.now() - this.config.get<number>('FILE_DELETION_RETENTION_DAYS', 30) * 86_400_000,
            ),
          },
        },
        select: { objectKey: true },
      }),
    );
    if (file) await this.storage.delete(file.objectKey);
  }
}
