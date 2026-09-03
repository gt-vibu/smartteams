import { Injectable } from '@nestjs/common';
import { FilePurpose, FileStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { limits, toFileDto } from './files-shared';

@Injectable()
export class FilesUploadService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
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

  /**
   * Marks an uploaded file available, once the stored object has been checked against what was
   * declared.
   *
   * Safe to call twice. A retry is the normal case rather than the exceptional one: the browser
   * PUTs to storage and then asks the API to complete, so a connection dropped between the API
   * committing and the response arriving leaves a client that must ask again about a file that
   * did upload. Answering "no such pending file" there is misleading — the upload succeeded.
   *
   * So the lookup accepts a file that is already AVAILABLE and returns what the first call
   * produced, without a second `HeadObject`, a second version row, or another audit entry.
   * DELETED and every other state stay not-found exactly as before.
   *
   * The equivalent guard inside the transaction is kept and is no longer unreachable: it now
   * covers the narrower race where two completions overlap and both read PENDING_UPLOAD, with the
   * row lock deciding which one writes.
   *
   * Returns the whole file, not just its new status. This route used to answer with
   * `{ id, status, versionId }`, which is not a file as far as the client is concerned: the
   * frontend parses the response as a `FileObject` and that shape has no `purpose`,
   * `originalName`, `contentType` or `byteSize`, so the parse failed and the browser reported
   * "The file response was not valid" — for an upload that had in fact succeeded and was already
   * sitting in the list underneath the error. `versionId` is kept alongside for callers that
   * want it.
   */

  async completeUpload(context: DomainContext, fileId: string, employeeId?: string) {
    requirePermission(context, 'files.write');
    const file = await this.database.run(context, (tx) =>
      tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          status: { in: [FileStatus.PENDING_UPLOAD, FileStatus.AVAILABLE] },
          ...(employeeId ? { employeeId } : {}),
        },
      }),
    );
    if (!file) throw new NotFoundError('Pending file');
    // Already completed by an earlier call. Nothing to verify and nothing to write.
    if (file.status === FileStatus.AVAILABLE)
      return { ...toFileDto(file), versionId: file.currentVersionId };
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
      return { ...toFileDto(updated), versionId: version.id };
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
}
