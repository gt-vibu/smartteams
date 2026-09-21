import { Injectable } from '@nestjs/common';
import { FileStatus, type FileAccessScope, type FilePurpose } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { decideFileAccess, mayUploadTo, type AccessDecision } from './files-access-policy';
import { candidateFilter, loadFileViewer } from './files-viewer';
import { FilesAccessService } from './files-access.service';
import { FilesUploadService } from './files-upload.service';
import { documentTypeFromMetadata } from './files-shared';
import { fileDisplayName } from './file-naming';
import type { EmployeeDocumentType } from './file.constants';

export type DocumentSection =
  'all' | 'mine' | 'shared' | 'organization' | 'team' | 'employees' | 'internal';

const FILE_SELECT = {
  id: true,
  organizationId: true,
  employeeId: true,
  teamId: true,
  uploadedByUserId: true,
  purpose: true,
  accessScope: true,
  allowDownload: true,
  originalName: true,
  contentType: true,
  byteSize: true,
  objectKey: true,
  metadata: true,
  createdAt: true,
  employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
  team: { select: { id: true, name: true } },
  uploadedBy: { select: { displayName: true } },
  shares: {
    select: {
      granteeType: true,
      granteeUserId: true,
      granteeRoleId: true,
      granteeTeamId: true,
      canDownload: true,
      expiresAt: true,
      revokedAt: true,
    },
  },
} as const;

/**
 * The website's documents: who may see which file, and why.
 *
 * Every read goes through `decideFileAccess` against the caller as the database knows them now.
 * The query narrows to files the caller might reach; the policy then decides, so a query that is
 * too broad can never leak a file the policy refuses. Federation keeps its own routes over
 * `FilesAccessService`, untouched.
 */
@Injectable()
export class FilesDocumentsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly upload: FilesUploadService,
    private readonly access: FilesAccessService,
  ) {}

  async list(context: DomainContext, section: DocumentSection, employeeId?: string) {
    requirePermission(context, 'files.read');
    return this.database.run(context, async (tx) => {
      const viewer = await loadFileViewer(tx, context);
      const rows = await tx.fileObject.findMany({
        where: {
          ...candidateFilter(context, viewer),
          ...(employeeId ? { employeeId } : {}),
        },
        select: FILE_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      return rows
        .map((row) => ({ row, access: decideFileAccess(row, viewer) }))
        .filter(({ row, access }) => access.view && inSection(section, row.accessScope, access))
        .map(({ row, access }) => toDocument(row, access));
    });
  }

  /** A short-lived link that opens the file in the browser. Needs view access. */
  async view(context: DomainContext, fileId: string) {
    const { file } = await this.authorize(context, fileId, 'view');
    const name = displayName(file);
    await this.record(context, file.id, 'FILE_VIEWED');
    return {
      fileId: file.id,
      displayName: name,
      viewUrl: await this.storage.createDownloadUrl(file.objectKey, {
        fileName: name,
        contentType: file.contentType,
        inline: true,
      }),
      expiresIn: 600,
    };
  }

  /** A short-lived download link. Refused, not hidden, when the file is view-only for the caller. */
  async download(context: DomainContext, fileId: string) {
    const { file } = await this.authorize(context, fileId, 'download');
    const name = displayName(file);
    await this.record(context, file.id, 'FILE_DOWNLOADED');
    return {
      fileId: file.id,
      displayName: name,
      downloadUrl: await this.storage.createDownloadUrl(file.objectKey, {
        fileName: name,
        contentType: file.contentType,
      }),
      viewUrl: await this.storage.createDownloadUrl(file.objectKey, {
        fileName: name,
        contentType: file.contentType,
        inline: true,
      }),
      expiresIn: 600,
    };
  }

  async beginUpload(
    context: DomainContext,
    input: {
      scope: FileAccessScope;
      purpose: FilePurpose;
      originalName: string;
      contentType: string;
      byteSize: number;
      checksumSha256?: string;
      employeeId?: string;
      teamId?: string;
      allowDownload?: boolean;
      documentType?: EmployeeDocumentType;
    },
  ) {
    const self = await this.database.run(context, (tx) => loadFileViewer(tx, context));
    // Personal files are always your own; an employee file defaults to yourself.
    const forEmployee =
      input.scope === 'PERSONAL'
        ? self.employeeId
        : input.scope === 'EMPLOYEE'
          ? (input.employeeId ?? self.employeeId)
          : null;
    if (!mayUploadTo(input.scope, self, forEmployee, input.teamId ?? null))
      throw new ForbiddenDomainError('You cannot add a document there');
    if (input.scope === 'TEAM' && !input.teamId)
      throw new ForbiddenDomainError('Choose the team the document is for');
    return this.upload.beginUpload(
      context,
      {
        purpose: input.purpose,
        originalName: input.originalName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        employeeId: forEmployee ?? undefined,
        documentType: input.documentType,
      },
      { scope: input.scope, teamId: input.teamId, allowDownload: input.allowDownload },
    );
  }

  async remove(context: DomainContext, fileId: string, reason: string) {
    await this.authorize(context, fileId, 'manage');
    // The existing soft delete keeps its retention, audit entry and purge job. It is reached only
    // after the policy has said this caller manages the file.
    return this.access.softDelete(asFileAdministrator(context), fileId, reason);
  }

  /** The file and the caller's access to it, or not-found: a refused id is never confirmed. */
  async authorize(
    context: DomainContext,
    fileId: string,
    need: keyof Pick<AccessDecision, 'view' | 'download' | 'manage' | 'share'>,
  ) {
    requirePermission(context, 'files.read');
    return this.database.run(context, async (tx) => {
      const viewer = await loadFileViewer(tx, context);
      const file = await tx.fileObject.findFirst({
        where: {
          id: fileId,
          organizationId: context.organizationId,
          // An upload whose bytes never arrived can still be removed by whoever may manage it;
          // otherwise an abandoned ticket stays in the list forever with no way to clear it.
          status:
            need === 'manage'
              ? { in: [FileStatus.AVAILABLE, FileStatus.PENDING_UPLOAD] }
              : FileStatus.AVAILABLE,
          deletedAt: null,
        },
        select: FILE_SELECT,
      });
      const access = file ? decideFileAccess(file, viewer) : null;
      if (!file || !access?.view) throw new NotFoundError('File');
      if (!access[need])
        throw new ForbiddenDomainError(
          need === 'download' ? 'This document can be viewed but not downloaded' : 'Not allowed',
        );
      return { file, access, viewer };
    });
  }

  private record(context: DomainContext, fileId: string, action: string) {
    return this.database.run(context, (tx) =>
      this.audit.record(context, { entityType: 'FILE_OBJECT', entityId: fileId, action }, tx),
    );
  }
}

type Row = {
  id: string;
  employeeId: string | null;
  teamId: string | null;
  purpose: FilePurpose;
  accessScope: FileAccessScope;
  allowDownload: boolean;
  originalName: string;
  contentType: string;
  byteSize: bigint;
  metadata: unknown;
  createdAt: Date;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
  team: { id: string; name: string } | null;
  uploadedBy: { displayName: string } | null;
  shares: ReadonlyArray<{ revokedAt: Date | null; expiresAt: Date | null }>;
};

function displayName(file: Pick<Row, 'purpose' | 'originalName' | 'metadata' | 'contentType'>) {
  return fileDisplayName(
    file.purpose,
    file.originalName,
    documentTypeFromMetadata(file.metadata) ?? undefined,
    file.contentType,
  );
}

function inSection(section: DocumentSection, scope: FileAccessScope, access: AccessDecision) {
  switch (section) {
    case 'all':
      return true;
    case 'mine':
      return access.reason === 'OWNER' || access.reason === 'ABOUT_YOU';
    case 'shared':
      // Anything a share names them in, including a file they could already reach some other
      // way. The sender is told the file was shared; this is the list that has to agree.
      return access.sharedWithYou === true;
    case 'organization':
      return scope === 'ORGANIZATION';
    case 'team':
      return scope === 'TEAM';
    case 'employees':
      return scope === 'EMPLOYEE' && (access.reason === 'HR' || access.reason === 'MANAGER');
    case 'internal':
      return scope === 'INTERNAL';
  }
}

function toDocument(row: Row, access: AccessDecision) {
  const now = new Date();
  return {
    id: row.id,
    name: displayName(row),
    purpose: row.purpose,
    scope: row.accessScope,
    contentType: row.contentType,
    byteSize: row.byteSize.toString(),
    uploadedAt: row.createdAt.toISOString(),
    uploadedBy: row.uploadedBy?.displayName ?? null,
    employee: row.employee
      ? {
          id: row.employee.id,
          name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
          employeeNumber: row.employee.employeeNumber,
        }
      : null,
    team: row.team,
    allowDownload: row.allowDownload,
    // Counted for anyone who may manage sharing; the list of grantees is its own route.
    activeShares: access.share
      ? row.shares.filter(
          (share) => !share.revokedAt && (!share.expiresAt || share.expiresAt > now),
        ).length
      : undefined,
    access: {
      view: access.view,
      download: access.download,
      manage: access.manage,
      share: access.share,
      reason: access.reason,
    },
  };
}

/**
 * The context handed to the shared soft delete once the policy has approved. That method scopes
 * by `files.read.all`; the documents policy has already made the narrower decision.
 */
function asFileAdministrator(context: DomainContext): DomainContext {
  return { ...context, permissions: new Set([...context.permissions, 'files.read.all']) };
}
