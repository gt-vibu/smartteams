import { Injectable } from '@nestjs/common';
import { FileAccessScope, FilePurpose, FileStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { canActForAllEmployees, resolveActingEmployeeId } from '../employees/employee-scope';
import { limits, requireFilePermission, toFileDto } from './files-shared';
import type { EmployeeDocumentType } from './file.constants';
import { fileDisplayName } from './file-naming';

/**
 * The breadth marker for files, as in listing, download and deletion: `files.read.all`, the
 * wildcard, or a federation grant.
 */
const FILES_BREADTH = 'files.read.all';

/**
 * Purposes that describe the organization's own records rather than an employee's documents.
 * A payslip in particular is something employees are shown and trust; letting anyone who can
 * upload their own resume also file a "payslip" against themselves would let them forge one.
 */
const ORGANIZATION_PURPOSES: ReadonlySet<FilePurpose> = new Set([
  FilePurpose.PAYSLIP,
  FilePurpose.PAYROLL_EXPORT,
  FilePurpose.IMPORT,
  FilePurpose.ORGANIZATION_BRANDING,
]);

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
      documentType?: EmployeeDocumentType;
    },
    /**
     * Who the file is for. Callers that do not say (federation) get what they always had: the
     * employee's file, or an internal one when there is no employee. The documents service
     * checks the caller may publish to the scope before passing it.
     */
    access?: {
      scope: FileAccessScope;
      teamId?: string;
      projectId?: string;
      allowDownload?: boolean;
    },
  ) {
    const branding = input.purpose === FilePurpose.ORGANIZATION_BRANDING;
    if (branding) requirePermission(context, 'organizations.update');
    else requireFilePermission(context, 'write');
    const sharedScope = branding ||
      access?.scope === 'ORGANIZATION' || access?.scope === 'TEAM' || access?.scope === 'PROJECT';
    // `files.write` is a self-service permission. It used to accept any employee id and any
    // purpose, so an employee could attach documents to a colleague's record or leave request, and
    // file payroll documents under anyone's name.
    const breadth = canActForAllEmployees(context, FILES_BREADTH);
    if (!breadth && ORGANIZATION_PURPOSES.has(input.purpose) && !branding)
      throw new ForbiddenDomainError('Only file administrators may upload this kind of file');
    if (branding && (input.employeeId || input.leaveRequestId || !input.contentType.startsWith('image/')))
      throw new ConflictError('Organization branding must be an organization image');
    const rule = limits[input.purpose];
    if (
      !rule.types.includes(input.contentType) ||
      input.byteSize <= 0 ||
      input.byteSize > rule.maxBytes
    )
      throw new ConflictError('File type or size is not allowed for this purpose');
    if (input.checksumSha256 && !/^[0-9a-f]{64}$/i.test(input.checksumSha256))
      throw new ConflictError('Checksum must be a SHA-256 hexadecimal digest');
    // Federation's dedicated DTO requires a document type. The generic native file endpoint
    // predates that taxonomy and remains compatible with unclassified employee documents.
    if (
      input.purpose === FilePurpose.PROFILE_IMAGE &&
      input.documentType &&
      input.documentType !== 'PROFILE_PICTURE'
    )
      throw new ConflictError('Employee profile images must use the profile picture type');
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
      {
        employeeId: input.employeeId,
        documentType: input.documentType,
        contentType: input.contentType,
      },
    );
    const displayName = fileDisplayName(
      input.purpose,
      input.originalName,
      input.documentType,
      input.contentType,
    );
    const file = await this.database.run(context, async (tx) => {
      // A self-service upload is always the caller's own, whether or not it named them: a file
      // with no employee is readable only with breadth, so the uploader could not see it again.
      // A company or team document is about nobody, so it is never filed against the uploader.
      const employeeId = sharedScope
        ? undefined
        : breadth
          ? input.employeeId
          : await resolveActingEmployeeId(tx, context, input.employeeId, FILES_BREADTH);
      if (access?.teamId) {
        const team = await tx.team.findFirst({
          where: { id: access.teamId, organizationId: context.organizationId },
          select: { status: true },
        });
        if (!team) throw new NotFoundError('Team');
        if (team.status === 'ARCHIVED')
          throw new ConflictError('An archived team takes no new files');
      }
      if (access?.projectId) {
        const project = await tx.project.findFirst({
          where: { id: access.projectId, organizationId: context.organizationId },
          select: { status: true },
        });
        if (!project) throw new NotFoundError('Project');
        if (project.status === 'ARCHIVED')
          throw new ConflictError('An archived project takes no new files');
      }
      const employee = employeeId
        ? await tx.employee.findFirst({
            where: { id: employeeId, organizationId: context.organizationId },
            select: { id: true },
          })
        : undefined;
      if (employeeId && !employee) throw new NotFoundError('Employee');
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
          employeeId: employeeId ?? leaveRequest?.employeeId,
          leaveRequestId: input.leaveRequestId,
          purpose: input.purpose,
          bucket: this.storage.getBucket(),
          objectKey: key,
          originalName: displayName,
          contentType: input.contentType,
          byteSize: BigInt(input.byteSize),
          checksumSha256: input.checksumSha256,
          accessScope: branding ? FileAccessScope.ORGANIZATION :
            access?.scope ??
            (employeeId || leaveRequest?.employeeId
              ? FileAccessScope.EMPLOYEE
              : FileAccessScope.INTERNAL),
          teamId: access?.scope === 'TEAM' ? access.teamId : undefined,
          projectId: access?.scope === 'PROJECT' ? access.projectId : undefined,
          allowDownload: access?.allowDownload ?? true,
          metadata: input.documentType
            ? { documentType: input.documentType, displayName }
            : { displayName },
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
    const upload = await this.storage.createUploadUrl({
      key,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
    });
    return {
      fileId: file.id,
      objectKey: key,
      uploadUrl: upload.url,
      uploadHeaders: upload.headers,
      displayName,
      expiresIn: 600,
    };
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

  async completeUpload(
    context: DomainContext,
    fileId: string,
    employeeId?: string,
    purpose?: FilePurpose | FilePurpose[],
  ) {
    const hasFileWrite = context.permissions.has('files.write') || context.permissions.has('*');
    if (!hasFileWrite) requirePermission(context, 'organizations.update');
    const file = await this.database.run(context, (tx) =>
      tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          status: { in: [FileStatus.PENDING_UPLOAD, FileStatus.AVAILABLE] },
          ...(employeeId ? { employeeId } : {}),
          ...(purpose ? { purpose: Array.isArray(purpose) ? { in: purpose } : purpose } : {}),
          // Completing publishes the file. A self-service caller may only complete an upload they
          // began; anyone else's pending file reads as missing, as it does everywhere else.
          ...(canActForAllEmployees(context, FILES_BREADTH)
            ? {}
            : { uploadedByUserId: context.actor.userId ?? null }),
        },
      }),
    );
    if (!file) throw new NotFoundError('Pending file');
    if (file.purpose === FilePurpose.ORGANIZATION_BRANDING) requirePermission(context, 'organizations.update');
    else requireFilePermission(context, 'write');
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
}
