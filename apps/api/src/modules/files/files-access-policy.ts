import type { FileAccessScope, FileShareGrantee } from '../../generated/prisma/enums';

/**
 * Who may view, download and manage one file. Pure, so every rule is testable on its own and the
 * service cannot drift from it.
 *
 * Five separate questions, answered in order and never merged:
 *   1. permission — may the caller read files at all (`files.read`)?
 *   2. scope      — who is the file for (personal, one employee, a team, everyone, internal)?
 *   3. relation   — is the caller that employee, on that team, or that employee's manager?
 *   4. sharing    — has the file been shared with the caller, their role or their team?
 *   5. breadth    — does a broad permission (`files.read.all`) reach this scope?
 *
 * Breadth never reaches PERSONAL: a private file stays private from administrators, including
 * the tenant wildcard. Only its owner, or someone the owner shares it with, can open it.
 * Who uploaded a file decides nothing on its own.
 */

export type AccessFile = {
  accessScope: FileAccessScope;
  employeeId: string | null;
  teamId: string | null;
  uploadedByUserId: string | null;
  allowDownload: boolean;
  shares: ReadonlyArray<AccessShare>;
};

export type AccessShare = {
  granteeType: FileShareGrantee;
  granteeUserId: string | null;
  granteeRoleId: string | null;
  granteeTeamId: string | null;
  canDownload: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type AccessViewer = {
  userId: string;
  /** The caller's employee in this organization, if they have one. */
  employeeId: string | null;
  roleIds: ReadonlySet<string>;
  /** Teams the caller's employee currently belongs to. */
  teamIds: ReadonlySet<string>;
  /** Employees whose current manager is the caller's employee. */
  reportIds: ReadonlySet<string>;
  permissions: ReadonlySet<string>;
};

export type AccessDecision = {
  view: boolean;
  download: boolean;
  manage: boolean;
  share: boolean;
  /** Why the caller can see it, for the screen: "Your file", "Shared with your team", … */
  reason: AccessReason | null;
  /**
   * Whether a share names this caller, whatever else also lets them see the file.
   *
   * `reason` cannot answer this: it reports the strongest route, so a file shared with someone
   * who is also on the team it belongs to reads as TEAM, and the file never reached their
   * "Shared with me" list although the sender had been told it was shared.
   */
  sharedWithYou?: boolean;
};

export type AccessReason =
  'OWNER' | 'ABOUT_YOU' | 'HR' | 'MANAGER' | 'TEAM' | 'ORGANIZATION' | 'ADMINISTRATOR' | 'SHARED';

const DENY: AccessDecision = {
  view: false,
  download: false,
  manage: false,
  share: false,
  reason: null,
};

const has = (viewer: AccessViewer, permission: string) =>
  viewer.permissions.has(permission) || viewer.permissions.has('*');

/** Shares that still apply now: not revoked, not expired, and naming the caller. */
export function matchingShares(file: AccessFile, viewer: AccessViewer, now = new Date()) {
  return file.shares.filter(
    (share) =>
      !share.revokedAt &&
      (!share.expiresAt || share.expiresAt > now) &&
      ((share.granteeType === 'USER' && share.granteeUserId === viewer.userId) ||
        (share.granteeType === 'ROLE' &&
          share.granteeRoleId !== null &&
          viewer.roleIds.has(share.granteeRoleId)) ||
        (share.granteeType === 'TEAM' &&
          share.granteeTeamId !== null &&
          viewer.teamIds.has(share.granteeTeamId))),
  );
}

export function decideFileAccess(
  file: AccessFile,
  viewer: AccessViewer,
  now = new Date(),
): AccessDecision {
  if (!has(viewer, 'files.read')) return DENY;
  const readAll = has(viewer, 'files.read.all');
  const publishes = has(viewer, 'files.organization.manage');
  const shares = has(viewer, 'files.share');
  const isAbout = viewer.employeeId !== null && file.employeeId === viewer.employeeId;
  // A personal file with no employee (a user with no employee record) belongs to its uploader.
  const isOwner =
    file.accessScope === 'PERSONAL' &&
    (isAbout || (file.employeeId === null && file.uploadedByUserId === viewer.userId));

  let base: AccessDecision = DENY;
  const full = (reason: AccessReason, share = true): AccessDecision => ({
    view: true,
    download: true,
    manage: true,
    share,
    reason,
  });
  const reader = (reason: AccessReason): AccessDecision => ({
    view: true,
    download: file.allowDownload,
    manage: false,
    share: false,
    reason,
  });

  switch (file.accessScope) {
    case 'PERSONAL':
      if (isOwner) base = full('OWNER');
      break;
    case 'EMPLOYEE':
      if (readAll) base = full('HR', shares);
      // Your own document: always downloadable, and removable if you were the one who sent it.
      // One HR filed about you (an offer letter) is not yours to delete.
      else if (isAbout)
        base = {
          ...reader('ABOUT_YOU'),
          download: true,
          manage: file.uploadedByUserId === viewer.userId,
        };
      else if (
        file.employeeId !== null &&
        viewer.reportIds.has(file.employeeId) &&
        has(viewer, 'files.reports.read')
      )
        base = reader('MANAGER');
      break;
    case 'TEAM':
      if (publishes) base = full('ADMINISTRATOR', shares);
      else if (readAll) base = { ...reader('HR'), download: true };
      else if (file.teamId !== null && viewer.teamIds.has(file.teamId)) base = reader('TEAM');
      break;
    case 'ORGANIZATION':
      base = publishes ? full('ADMINISTRATOR', shares) : reader('ORGANIZATION');
      break;
    case 'INTERNAL':
      if (readAll) base = full('ADMINISTRATOR', shares);
      break;
  }

  const granted = matchingShares(file, viewer, now);
  if (granted.length === 0) return base;
  return {
    view: true,
    download: base.download || granted.some((share) => share.canDownload),
    manage: base.manage,
    share: base.share,
    reason: base.reason ?? 'SHARED',
    sharedWithYou: true,
  };
}

/** Which scopes a caller may create a file in, and for whom. */
export function mayUploadTo(
  scope: FileAccessScope,
  viewer: Pick<AccessViewer, 'permissions' | 'employeeId'> & { teamIds?: ReadonlySet<string> },
  forEmployeeId: string | null,
  teamId: string | null = null,
): boolean {
  const can = (permission: string) =>
    viewer.permissions.has(permission) || viewer.permissions.has('*');
  if (!can('files.write')) return false;
  switch (scope) {
    case 'PERSONAL':
      // Only ever into your own space: nobody files a "private" document for someone else.
      return viewer.employeeId !== null && forEmployeeId === viewer.employeeId;
    case 'EMPLOYEE':
      return (
        forEmployeeId !== null && (forEmployeeId === viewer.employeeId || can('files.read.all'))
      );
    case 'TEAM':
      // Anyone on a team (or leading it) may share a file with that team.
      return (
        can('files.organization.manage') ||
        (teamId !== null && Boolean(viewer.teamIds?.has(teamId)))
      );
    case 'ORGANIZATION':
      return can('files.organization.manage');
    case 'INTERNAL':
      return can('files.read.all');
  }
}
