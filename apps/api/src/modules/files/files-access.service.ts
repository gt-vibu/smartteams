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

  /**
   * Files the caller may see.
   *
   * Deliberately added only after `download` was self-scoped: a listing on top of an unscoped read
   * would have turned "guess a file id" into "enumerate every payslip in the tenant".
   *
   * The boundary is the same one `download` enforces. `files.read` returns the caller's own
   * employee's files and nothing else — not even organization-level files, which belong to nobody
   * in particular. `files.read.all` (or the wildcard) returns the tenant's. Deleted files are
   * excluded, and the page is bounded so the list cannot sweep the tenant in one call.
   */
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

  /**
   * A short-lived download URL for one file.
   *
   * `files.read` alone used to be enough for any file in the tenant, which meant a colleague's
   * payslip or leave attachment was reachable by anyone who knew its id. Reads are now self-scoped
   * the way Leave, Attendance and Payroll already are: `files.read` reaches your own employee's
   * files, `files.read.all` (or the tenant wildcard) reaches everyone's, and a federation grant
   * keeps the breadth its scope carries.
   *
   * A file with no employee — a payroll export, an import, an organization document — is not
   * anyone's own file, so it needs the broader permission too.
   */
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

  /**
   * Whether the caller may delete files that are not their own.
   *
   * `files.read.all` is the breadth marker the listing and download paths already use; deletion
   * is a strictly greater power than reading, so it is gated on the same permission rather than
   * on `files.write`, which every self-service employee holds.
   */
  private static canDeleteAny(context: DomainContext): boolean {
    return (
      context.accessMode === 'FEDERATION' ||
      context.permissions.has('*') ||
      context.permissions.has('files.read.all')
    );
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
      // Listing and downloading already narrow to the caller's own files; deleting did not, so a
      // employee holding `files.write` could destroy a colleague's payslip or leave attachment
      // from its id alone. The same self/all split now governs all three.
      //
      // A file with no employee — an organisation-level document — is deletable only by a caller
      // with `files.read.all`, because there is no owner for a self-scoped caller to match.
      if (!FilesAccessService.canDeleteAny(context)) {
        const self = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        // Reported as missing rather than forbidden, so the endpoint cannot confirm that a file
        // id exists in the tenant.
        if (!self || !file.employeeId || file.employeeId !== self.id)
          throw new NotFoundError('File');
      }
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
