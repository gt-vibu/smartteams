import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AccessMode, FilePurpose, FileStatus } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import type { Queue } from 'bullmq';

const limits: Record<FilePurpose, { maxBytes: number; types: string[] }> = {
  PROFILE_IMAGE: { maxBytes: 5_000_000, types: ['image/jpeg', 'image/png', 'image/webp'] },
  RESUME: {
    maxBytes: 15_000_000,
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  EMPLOYEE_DOCUMENT: {
    maxBytes: 25_000_000,
    types: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  LEAVE_ATTACHMENT: { maxBytes: 15_000_000, types: ['application/pdf', 'image/jpeg', 'image/png'] },
  PAYSLIP: { maxBytes: 15_000_000, types: ['application/pdf'] },
  PAYROLL_EXPORT: {
    maxBytes: 50_000_000,
    types: [
      'text/csv',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  IMPORT: { maxBytes: 50_000_000, types: ['text/csv', 'application/json', 'application/zip'] },
  OTHER: { maxBytes: 25_000_000, types: ['application/octet-stream'] },
};

@Injectable()
export class FilesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue('file-lifecycle') private readonly lifecycleQueue: Queue,
  ) {}

  async beginUpload(
    context: DomainContext,
    input: {
      purpose: FilePurpose;
      originalName: string;
      contentType: string;
      byteSize: number;
      checksumSha256?: string;
      employeeId?: string;
      leaveRequestId?: string;
    },
  ) {
    requirePermission(context, 'files.write');
    const rule = limits[input.purpose];
    if (
      !rule.types.includes(input.contentType) ||
      input.byteSize <= 0 ||
      input.byteSize > rule.maxBytes
    )
      throw new ConflictError('File type or size is not allowed for this purpose');
    if (input.checksumSha256 && !/^[0-9a-f]{64}$/i.test(input.checksumSha256))
      throw new ConflictError('Checksum must be a SHA-256 hexadecimal digest');
    if (
      input.purpose === FilePurpose.LEAVE_ATTACHMENT &&
      !input.employeeId &&
      !input.leaveRequestId
    )
      throw new ConflictError('Leave attachments must reference an employee or leave request');
    const key = this.storage.createObjectKey(
      context.organizationId,
      input.purpose,
      input.originalName,
    );
    const file = await this.database.run(context, async (tx) => {
      const employee = input.employeeId
        ? await tx.employee.findFirst({
            where: { id: input.employeeId, organizationId: context.organizationId },
            select: { id: true },
          })
        : undefined;
      if (input.employeeId && !employee) throw new NotFoundError('Employee');
      const leaveRequest = input.leaveRequestId
        ? await tx.leaveRequest.findFirst({
            where: { id: input.leaveRequestId, organizationId: context.organizationId },
            select: { id: true, employeeId: true },
          })
        : undefined;
      if (input.leaveRequestId && !leaveRequest) throw new NotFoundError('Leave request');
      if (leaveRequest && employee && leaveRequest.employeeId !== employee.id)
        throw new ConflictError('Leave attachment employee does not match the leave request');
      const file = await tx.fileObject.create({
        data: {
          organizationId: context.organizationId,
          uploadedByUserId: context.actor.userId,
          employeeId: input.employeeId ?? leaveRequest?.employeeId,
          leaveRequestId: input.leaveRequestId,
          purpose: input.purpose,
          bucket: this.storage.getBucket(),
          objectKey: key,
          originalName: input.originalName.replace(/[\\/]/g, '_'),
          contentType: input.contentType,
          byteSize: BigInt(input.byteSize),
          checksumSha256: input.checksumSha256,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: file.id,
          action: 'FILE_UPLOAD_STARTED',
          afterState: jsonSnapshot({
            id: file.id,
            purpose: file.purpose,
            contentType: file.contentType,
            byteSize: file.byteSize,
          }),
        },
        tx,
      );
      return file;
    });
    const uploadUrl = await this.storage.createUploadUrl({
      key,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
    });
    return { fileId: file.id, objectKey: key, uploadUrl, expiresIn: 600 };
  }

  async completeUpload(context: DomainContext, fileId: string, employeeId?: string) {
    requirePermission(context, 'files.write');
    const file = await this.database.run(context, (tx) =>
      tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          status: FileStatus.PENDING_UPLOAD,
          ...(employeeId ? { employeeId } : {}),
        },
      }),
    );
    if (!file) throw new NotFoundError('Pending file');
    const head = await this.storage.head(file.objectKey);
    if (Number(head.ContentLength ?? -1) !== Number(file.byteSize))
      throw new ConflictError('Uploaded file size does not match the declared size');
    if (
      file.checksumSha256 &&
      (!head.ChecksumSHA256 ||
        Buffer.from(file.checksumSha256, 'hex').toString('base64') !== head.ChecksumSHA256)
    )
      throw new ConflictError('Uploaded file checksum does not match');
    return this.database.run(context, async (tx) => {
      await tx.$queryRaw`SELECT id FROM file_objects WHERE id = ${file.id}::uuid FOR UPDATE`;
      const current = await tx.fileObject.findUnique({
        where: { id: file.id },
        select: { id: true, status: true, currentVersionId: true },
      });
      if (!current || current.status === FileStatus.DELETED) throw new NotFoundError('File');
      if (current.status === FileStatus.AVAILABLE)
        return { id: current.id, status: current.status, versionId: current.currentVersionId };
      const version = await tx.fileObjectVersion.create({
        data: {
          fileObjectId: file.id,
          s3VersionId: head.VersionId ?? 'current',
          byteSize: file.byteSize,
          checksumSha256: file.checksumSha256,
          uploadedAt: new Date(),
          createdByUserId: context.actor.userId,
          isCurrent: true,
        },
      });
      const updated = await tx.fileObject.update({
        where: { id: file.id },
        data: { status: FileStatus.AVAILABLE, currentVersionId: version.id },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: file.id,
          action: 'FILE_UPLOAD_COMPLETED',
          afterState: jsonSnapshot({
            id: updated.id,
            status: updated.status,
            versionId: version.id,
          }),
        },
        tx,
      );
      return { id: updated.id, status: updated.status, versionId: version.id };
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
      return files.map((file) => ({ ...file, byteSize: file.byteSize.toString() }));
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
      return updated;
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
