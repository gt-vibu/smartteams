import { Injectable } from '@nestjs/common';
import type { FileShareGrantee } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { FilesDocumentsService } from './files-documents.service';

export type ShareInput = {
  granteeType: FileShareGrantee;
  granteeId?: string;
  /** A person named by their employee record; resolved to their login here. */
  granteeEmployeeId?: string;
  canDownload?: boolean;
  expiresAt?: string;
};

/**
 * Explicit sharing: one file, to a person, a role or a team, optionally until a date and
 * optionally without download. Revoking takes effect on the grantee's next request, because
 * every read evaluates the shares as they are now.
 *
 * Who may share is the policy's `share` answer: the owner of a personal file, or someone with
 * `files.share` and authority over the file's scope. The grantee must be in this organization.
 */
@Injectable()
export class FilesSharesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly documents: FilesDocumentsService,
  ) {}

  async list(context: DomainContext, fileId: string) {
    await this.documents.authorize(context, fileId, 'share');
    return this.database.run(context, async (tx) => {
      const shares = await tx.fileShare.findMany({
        where: { organizationId: context.organizationId, fileObjectId: fileId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const [users, roles, teams] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: ids(shares, 'granteeUserId') } },
          select: { id: true, displayName: true, email: true },
        }),
        tx.role.findMany({
          where: {
            id: { in: ids(shares, 'granteeRoleId') },
            organizationId: context.organizationId,
          },
          select: { id: true, name: true },
        }),
        tx.team.findMany({
          where: {
            id: { in: ids(shares, 'granteeTeamId') },
            organizationId: context.organizationId,
          },
          select: { id: true, name: true },
        }),
      ]);
      const names = new Map<string, string>([
        ...users.map((user) => [user.id, user.displayName || user.email] as [string, string]),
        ...roles.map((role) => [role.id, role.name] as [string, string]),
        ...teams.map((team) => [team.id, team.name] as [string, string]),
      ]);
      return shares.map((share) => {
        const granteeId = share.granteeUserId ?? share.granteeRoleId ?? share.granteeTeamId ?? '';
        return {
          id: share.id,
          granteeType: share.granteeType,
          granteeId,
          granteeName: names.get(granteeId) ?? 'Unknown',
          canDownload: share.canDownload,
          expiresAt: share.expiresAt?.toISOString() ?? null,
          expired: share.expiresAt !== null && share.expiresAt <= new Date(),
          createdAt: share.createdAt.toISOString(),
        };
      });
    });
  }

  async create(context: DomainContext, fileId: string, input: ShareInput) {
    const { access } = await this.documents.authorize(context, fileId, 'share');
    // The owner of a personal file shares it as its owner; anyone else needs the permission.
    if (access.reason !== 'OWNER') requirePermission(context, 'files.share');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()))
      throw new ConflictError('A share must expire in the future');
    return this.database.run(context, async (tx) => {
      const granteeId = await resolveGrantee(tx, context.organizationId, input);
      await assertGrantee(tx, context.organizationId, input.granteeType, granteeId);
      const share = await tx.fileShare.create({
        data: {
          organizationId: context.organizationId,
          fileObjectId: fileId,
          granteeType: input.granteeType,
          granteeUserId: input.granteeType === 'USER' ? granteeId : null,
          granteeRoleId: input.granteeType === 'ROLE' ? granteeId : null,
          granteeTeamId: input.granteeType === 'TEAM' ? granteeId : null,
          canDownload: input.canDownload ?? false,
          expiresAt,
          createdByUserId: context.actor.userId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: fileId,
          action: 'FILE_SHARED',
          afterState: jsonSnapshot(share),
        },
        tx,
      );
      return { id: share.id };
    });
  }

  async revoke(context: DomainContext, fileId: string, shareId: string) {
    await this.documents.authorize(context, fileId, 'share');
    return this.database.run(context, async (tx) => {
      const share = await tx.fileShare.findFirst({
        where: {
          id: shareId,
          fileObjectId: fileId,
          organizationId: context.organizationId,
          revokedAt: null,
        },
      });
      if (!share) throw new NotFoundError('Share');
      const revoked = await tx.fileShare.update({
        where: { id: share.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        context,
        {
          entityType: 'FILE_OBJECT',
          entityId: fileId,
          action: 'FILE_SHARE_REVOKED',
          beforeState: jsonSnapshot(share),
          afterState: jsonSnapshot(revoked),
        },
        tx,
      );
      return { id: revoked.id, revokedAt: revoked.revokedAt?.toISOString() ?? null };
    });
  }
}

function ids(
  shares: ReadonlyArray<Record<'granteeUserId' | 'granteeRoleId' | 'granteeTeamId', string | null>>,
  key: 'granteeUserId' | 'granteeRoleId' | 'granteeTeamId',
) {
  return shares.map((share) => share[key]).filter((id): id is string => Boolean(id));
}

type Tx = Parameters<Parameters<TenantDatabaseService['run']>[1]>[0];

/** The grantee's id: given directly, or a person's login found from their employee record. */
async function resolveGrantee(tx: Tx, organizationId: string, input: ShareInput): Promise<string> {
  if (input.granteeType === 'USER' && input.granteeEmployeeId) {
    const employee = await tx.employee.findFirst({
      where: { id: input.granteeEmployeeId, organizationId },
      select: { userId: true },
    });
    if (!employee) throw new NotFoundError('Employee');
    if (!employee.userId) throw new ConflictError('This employee has no login to share with yet');
    return employee.userId;
  }
  if (!input.granteeId) throw new ConflictError('Choose who to share the document with');
  return input.granteeId;
}

/** The grantee exists in this organization. A person must be an active member of it. */
async function assertGrantee(tx: Tx, organizationId: string, type: FileShareGrantee, id: string) {
  const found =
    type === 'USER'
      ? await tx.userOrganization.findFirst({
          where: { organizationId, userId: id, status: 'ACTIVE' },
          select: { userId: true },
        })
      : type === 'ROLE'
        ? await tx.role.findFirst({ where: { organizationId, id }, select: { id: true } })
        : await tx.team.findFirst({ where: { organizationId, id }, select: { id: true } });
  if (!found)
    throw new NotFoundError(type === 'USER' ? 'Member' : type === 'ROLE' ? 'Role' : 'Team');
}
